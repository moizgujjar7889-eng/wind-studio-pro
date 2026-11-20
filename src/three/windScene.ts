import * as THREE from 'three';
import type { CharacterPreset, LocationPreset } from '../lib/types';
import { createCharacter, type CharacterRig } from './character';
import { loadGLBCharacter } from './glbCharacter';
import { createDressSimulation, type DressSimulation } from './dressSim';
import { createEnvironment, type EnvironmentHandle } from './environment';

export interface WindSceneOptions {
  onFps?: (fps: number) => void;
}

export class WindScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private env: EnvironmentHandle;
  private rig: CharacterRig | null = null;
  private dress: DressSimulation | null = null;
  private currentChar: CharacterPreset | null = null;
  private windLevel = 0;
  private yaw = 0.35;
  private zoom = 3.8;
  private targetZoom = 3.8;
  private raf = 0;
  private frameCount = 0;
  private lastFpsTime = 0;
  private onFps?: (fps: number) => void;
  private disposed = false;
  private loadId = 0;

  constructor(
    private container: HTMLElement,
    location: LocationPreset,
    character: CharacterPreset,
    opts: WindSceneOptions = {},
  ) {
    this.onFps = opts.onFps;

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.innerWidth > 700,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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

    this.env = createEnvironment(this.scene, location);
    this.setCharacter(character);

    window.addEventListener('resize', this.onResize);
    this.lastFpsTime = performance.now();
    this.loop();
  }

  setLocation(loc: LocationPreset) {
    this.env.setLocation(loc);
  }

  setCharacter(preset: CharacterPreset) {
    const myLoadId = ++this.loadId;

    if (this.dress) {
      this.dress.dispose();
      this.dress = null;
    }
    if (this.rig) {
      this.scene.remove(this.rig.group);
      this.rig.dispose();
      this.rig = null;
    }

    this.currentChar = preset;

    if (preset.glbPath) {
      loadGLBCharacter(preset, preset.glbPath)
        .then((rig) => {
          if (this.disposed || myLoadId !== this.loadId) {
            rig.dispose();
            return;
          }
          this.rig = rig;
          this.scene.add(rig.group);
          this.dress = null;
        })
        .catch((err) => {
          console.error('Failed to load GLB character:', err);
          if (this.disposed || myLoadId !== this.loadId) return;
          this.rig = createCharacter(preset);
          this.scene.add(this.rig.group);
          this.dress = createDressSimulation(this.rig, this.scene, {
            dressColor: preset.dressColor,
            accentColor: preset.accentColor,
            hairColor: preset.hairColor,
            dressLength: preset.dressLength,
            fit: preset.fit,
            style: preset.style,
          });
        });
    } else {
      this.rig = createCharacter(preset);
      this.scene.add(this.rig.group);

      this.dress = createDressSimulation(this.rig, this.scene, {
        dressColor: preset.dressColor,
        accentColor: preset.accentColor,
        hairColor: preset.hairColor,
        dressLength: preset.dressLength,
        fit: preset.fit,
        style: preset.style,
      });
    }
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
    const h = this.container.clientHeight;
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
    this.dress?.update(dt, time, this.windLevel);
    this.rig?.update?.(dt, time, this.windLevel);

    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.onFps?.(this.frameCount);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);

    this.dress?.dispose();
    if (this.rig) {
      this.scene.remove(this.rig.group);
      this.rig.dispose();
    }
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
