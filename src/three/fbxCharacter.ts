import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';
import { WIND_MIN } from '../lib/windEngine';

const MAX_TEX = typeof window !== 'undefined' && window.innerWidth < 700 ? 1536 : 2048;

/** Downscale huge textures so phones do not crawl or blur. */
function shrinkTexture(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const img = tex.image as any;
  if (!img || !img.width || !img.height) return;
  const m = Math.max(img.width, img.height);
  if (m <= MAX_TEX) return;
  const k = MAX_TEX / m;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tex as any).image = c;
  tex.needsUpdate = true;
}

/**
 * Loads a Mixamo-rigged FBX (skeleton + "Happy Idle" animation + embedded texture).
 * The skeleton does the idle motion, so the face stays stable.
 */
export async function loadFBXCharacter(_preset: CharacterPreset, path: string): Promise<CharacterRig> {
  const model = await new FBXLoader().loadAsync(path);

  // Mixamo files are in centimetres: scale to 1.72 m, centre on the floor.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y < 0.01) throw new Error('Invalid model dimensions');
  model.scale.multiplyScalar(1.72 / size.y);
  model.updateMatrixWorld(true);
  const sb = new THREE.Box3().setFromObject(model);
  const c = sb.getCenter(new THREE.Vector3());
  model.position.x += -c.x;
  model.position.z += -c.z;
  model.position.y += -sb.min.y;
  model.updateMatrixWorld(true);

  const oldMats: THREE.Material[] = [];
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((m) => {
      const old = m as THREE.MeshPhongMaterial;
      shrinkTexture(old.map);
      const std = new THREE.MeshStandardMaterial({
        map: old.map ?? null,
        normalMap: old.normalMap ?? null,
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
      oldMats.push(m);
      return std;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  oldMats.forEach((m) => m.dispose());

  const mixer = new THREE.AnimationMixer(model);
  const clip = model.animations[0];
  if (clip) mixer.clipAction(clip).play();

  const group = new THREE.Group();
  group.add(model);
  const body = new THREE.Group();
  group.add(body);
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftHand = new THREE.Object3D();
  const rightHand = new THREE.Object3D();
  leftArm.add(leftHand);
  rightArm.add(rightHand);
  group.add(leftArm);
  group.add(rightArm);
  const head = new THREE.Object3D();
  head.position.y = 1.65;
  group.add(head);
  const holdTarget = new THREE.Vector3(0, 0.82, 0.12);

  const update = (dt: number, _time: number, wind01: number) => {
    mixer.update(Math.min(dt, 0.05));
    const eff = wind01 >= WIND_MIN ? THREE.MathUtils.clamp(wind01, 0, 1) : 0;
    // gentle lean into the wind; everything else comes from the skeleton animation
    const targetLean = -0.05 * eff;
    group.rotation.x += (targetLean - group.rotation.x) * Math.min(1, dt * 4);
  };

  const dispose = () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.normalMap?.dispose();
        m.dispose();
      });
    });
  };

  return {
    group, body, leftArm, rightArm, leftHand, rightHand, head,
    hairRoots: [], holdTarget, update, dispose,
  };
}
