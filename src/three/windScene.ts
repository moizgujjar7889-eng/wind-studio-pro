import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { CharacterPreset, LocationPreset } from '../lib/types';
import type { CharacterRig } from './character';
import { loadGLBCharacter } from './glbCharacter';
import { createEnvironment, type EnvironmentHandle } from './environment';

export interface WindSceneOptions {
  onFps?: (fps: number) => void;
  /** true while a GLB character is downloading/decoding */
  onLoading?: (loading: boolean) => void;
  onError?: (message: string | null) => void;
}

export class WindScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private env: EnvironmentHandle;
  private rig: CharacterRig | null = null;
  private currentChar: CharacterPreset | null = null;
  private windLevel = 0;
  private yaw = 0.35;
  private zoom = 3.8;
  private targetZoom = 3.8;
  private raf = 0;
  private frameCount = 0;
  private lastFpsTime = 0;
  private onFps?: (fps: number) => void;
  private onLoading?: (loading: boolean) => void;
  private onError?: (message: string | null) => void;
  private pixelRatio = 1.5;
  private lowFpsSeconds = 0;
  private roomEnv: THREE.Texture | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private hdriTexs: THREE.Texture[] = [];
  private hdriId = 0;
  private currentLocId = '';
  private disposed = false;
  private loadId = 0;
  private loading = false;

  constructor(
    private container: HTMLElement,
    location: LocationPreset,
    character: CharacterPreset,
    opts: WindSceneOptions = {},
  ) {
    this.onFps = opts.onFps;
    this.onLoading = opts.onLoading;
    this.onError = opts.onError;

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.innerWidth > 700,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      120,
    );

    // Image-based lighting: this is what makes skin, cloth and hair look realistic instead of flat.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.roomEnv;
    this.scene.environmentIntensity = 0.5;

    this.env = createEnvironment(this.scene, location);
    this.currentLocId = location.id;
    this.tryLoadHdri(location.id);
    this.setCharacter(character);

    window.addEventListener('resize', this.onResize);
    this.lastFpsTime = performance.now();
    this.loop();
  }

  setLocation(loc: LocationPreset) {
    if (loc.id === this.currentLocId) return;
    this.currentLocId = loc.id;
    this.env.setLocation(loc);
    this.tryLoadHdri(loc.id);
  }

  /**
   * Real places: public/assets/places/<id>.jpg is the 360 photo, <id>_env.hdr is a tiny lighting map.
   * If the photo does not exist the (simple) built-in place is shown.
   */
  private async tryLoadHdri(id: string) {
    const myId = ++this.hdriId;
    const clear = () => {
      this.env.setHdri(false);
      this.scene.background = null;
      this.scene.environment = this.roomEnv;
      this.scene.environmentIntensity = 0.5;
      this.hdriTexs.forEach((t) => t.dispose());
      this.hdriTexs = [];
    };
    const exists = async (url: string) => {
      const head = await fetch(url, { method: 'HEAD' });
      return head.ok && !(head.headers.get('content-type') || '').includes('text/html');
    };
    try {
      const base = `/assets/places/${id}`;
      if (!(await exists(`${base}.jpg`))) {
        if (myId === this.hdriId) clear();
        return;
      }
      const bg = await new THREE.TextureLoader().loadAsync(`${base}.jpg`);
      bg.mapping = THREE.EquirectangularReflectionMapping;
      bg.colorSpace = THREE.SRGBColorSpace;
      let envTex: THREE.Texture = bg;
      const texs: THREE.Texture[] = [bg];
      try {
        if (await exists(`${base}_env.hdr`)) {
          const e = await new RGBELoader().loadAsync(`${base}_env.hdr`);
          e.mapping = THREE.EquirectangularReflectionMapping;
          envTex = e;
          texs.push(e);
        }
      } catch {
        /* lighting map is optional */
      }
      if (this.disposed || myId !== this.hdriId) {
        texs.forEach((t) => t.dispose());
        return;
      }
      clear();
      this.hdriTexs = texs;
      this.scene.background = bg;
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.9;
      this.env.setHdri(true);
    } catch {
      if (myId === this.hdriId && !this.disposed) clear();
    }
  }

  setCharacter(preset: CharacterPreset) {
    if (this.currentChar?.id === preset.id && (this.rig || this.loading)) return;
    const myLoadId = ++this.loadId;
    this.onError?.(null);

    if (this.rig) {
      this.scene.remove(this.rig.group);
      this.rig.dispose();
      this.rig = null;
    }

    this.currentChar = preset;

    this.loading = true;
    this.onLoading?.(true);
    loadGLBCharacter(preset, preset.glbPath)
      .then((rig) => {
        if (this.disposed || myLoadId !== this.loadId) {
          rig.dispose();
          return;
        }
        this.loading = false;
        this.onLoading?.(false);
        this.rig = rig;
        this.scene.add(rig.group);
      })
      .catch((err) => {
        console.error('Failed to load GLB character:', err);
        if (this.disposed || myLoadId !== this.loadId) return;
        this.loading = false;
        this.currentChar = null;
        this.onLoading?.(false);
        this.onError?.(`${preset.name} load nahi hua. Internet check karein ya file ka path dekhein.`);
      });
  }

  setWind(level: number) {
    this.windLevel = Math.max(0, Math.min(1, level));
  }

  addYaw(delta: number) {
    this.yaw += delta;
  }

  addZoom(delta: number) {
    this.targetZoom = Math.max(2.2, Math.min(6.5, this.targetZoom + delta));
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(0.033, this.clock.getDelta());
    const time = this.clock.elapsedTime;

    this.zoom += (this.targetZoom - this.zoom) * 0.12;
    const camX = Math.sin(this.yaw) * this.zoom;
    const camZ = Math.cos(this.yaw) * this.zoom;
    this.camera.position.set(camX, 1.55, camZ);
    this.camera.lookAt(0, 1.25, 0);

    this.env.update(dt, time, this.windLevel);
    this.rig?.update?.(dt, time, this.windLevel);

    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.onFps?.(this.frameCount);
      // Phone too slow? Lower resolution step by step (keeps the app smooth).
      if (this.frameCount < 28 && !this.loading) this.lowFpsSeconds++;
      else this.lowFpsSeconds = 0;
      if (this.lowFpsSeconds >= 3 && this.pixelRatio > 0.85) {
        this.pixelRatio = Math.max(0.85, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.lowFpsSeconds = 0;
      }
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);

    if (this.rig) {
      this.scene.remove(this.rig.group);
      this.rig.dispose();
    }
    this.env.dispose();
    this.hdriTexs.forEach((t) => t.dispose());
    this.roomEnv?.dispose();
    this.pmrem?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
