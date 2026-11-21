import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';


type WindUniforms = {
  uWind: { value: number };
  uTime: { value: number };
  uHemLo: { value: number };
  uHemHi: { value: number };
};

/**
 * GPU vertex motion (no skeleton needed):
 *  1. idle life  - always on: slow spine sway + breathing, so the character is never a statue
 *  2. blow wind  - only when uWind > 0: hem lifts and flares outward, cloth ripples
 */
function applyGpuWind(mat: THREE.Material, u: WindUniforms, weight: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uHemLo = u.uHemLo;
    shader.uniforms.uHemHi = u.uHemHi;
    shader.uniforms.uWeight = { value: weight };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWind; uniform float uTime; uniform float uWeight; uniform float uHemLo; uniform float uHemHi;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
float rad = length(wPos.xz);
float hN = clamp(wPos.y / 1.7, 0.0, 1.0);
float up = hN * hN;
vec3 wDisp = vec3(
  (sin(uTime * 0.9) * 0.026 + sin(uTime * 0.37 + 1.3) * 0.014) * up,
  0.0,
  sin(uTime * 0.7 + 0.8) * 0.016 * up
);
float chest = smoothstep(1.0, 1.2, wPos.y) * (1.0 - smoothstep(1.35, 1.55, wPos.y));
wDisp.z += sin(uTime * 1.9) * 0.006 * chest;
float tw = sin(uTime * 0.55) * 0.075 * smoothstep(0.85, 1.5, wPos.y);
float ct = cos(tw); float st = sin(tw);
wDisp.x += ct * wPos.x - st * wPos.z - wPos.x;
wDisp.z += st * wPos.x + ct * wPos.z - wPos.z;
float hip = smoothstep(0.55, 0.95, wPos.y) * (1.0 - smoothstep(1.0, 1.35, wPos.y));
wDisp.x += sin(uTime * 0.5 + 0.6) * 0.035 * hip;
if (uWind > 0.001) {
  float nY = clamp((wPos.y - uHemLo) / max(uHemHi - uHemLo, 0.1), 0.0, 1.0);
  float mask = uWeight > 0.99 ? 1.0 : smoothstep(0.2, 0.3, rad) * (1.0 - smoothstep(0.95, 1.1, wPos.y));
  float hem = pow(1.0 - nY, 1.5) * mask;
  float ph = uTime * 7.0 + wPos.x * 9.0 + wPos.z * 6.0;
  float gust = 0.5 + 0.5 * sin(uTime * 7.3 + wPos.x * 2.0);
  vec2 dirR = rad > 0.001 ? wPos.xz / rad : vec2(0.0);
  float flare = 0.16 * uWind * hem * (0.5 + 0.5 * gust);
  wDisp += vec3(
    sin(ph * 0.7) * 0.06 * uWind * hem + dirR.x * flare,
    (0.3 * uWind * gust + sin(ph) * 0.03 * uWind) * hem,
    sin(ph * 0.9 + 1.3) * 0.05 * uWind * hem + dirR.y * flare
  );
}
transformed += inverse(mat3(modelMatrix)) * wDisp;
#include <project_vertex>`,
      );
  };
  mat.customProgramCacheKey = () => `wind4-${weight}`;
  mat.needsUpdate = true;
}

const MAX_TEX = typeof window !== 'undefined' && window.innerWidth < 700 ? 1536 : 2048;

let sharedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!sharedLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const l = new GLTFLoader();
    l.setDRACOLoader(draco);
    l.setMeshoptDecoder(MeshoptDecoder);
    sharedLoader = l;
  }
  return sharedLoader;
}

/** Huge textures make phones crawl (16 fps). Downscale anything above MAX_TEX. */
function shrinkTexture(tex: THREE.Texture | null | undefined, done: Set<THREE.Texture>) {
  if (!tex || done.has(tex)) return;
  done.add(tex);
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

function normalizeModel(model: THREE.Object3D, targetHeight: number, lift: number, offset: [number, number] = [0, 0]) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y < 0.01) throw new Error('Invalid model dimensions');
  model.scale.setScalar(targetHeight / size.y);
  model.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(model);
  const c = scaled.getCenter(new THREE.Vector3());
  model.position.x += -c.x + offset[0];
  model.position.z += -c.z + offset[1];
  model.position.y += -scaled.min.y + lift;
  model.updateMatrixWorld(true);
}

function styleModel(model: THREE.Object3D, isGarment: boolean, windUniforms: WindUniforms) {
  const doneTex = new Set<THREE.Texture>();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true; // shadow bias/normalBias in windScene prevents stripes
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshName = `${mesh.name} ${mats.map((m) => m.name).join(' ')}`.toLowerCase();
    mats.forEach((mat) => {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap].forEach((t) =>
          shrinkTexture(t, doneTex),
        );
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].forEach((t) => {
          if (t) t.anisotropy = 4;
        });
        mat.roughness = Math.max(0.42, Math.min(mat.roughness ?? 0.75, 0.92));
        mat.metalness = Math.min(mat.metalness ?? 0, 0.2);
        mat.envMapIntensity = 1.0;
        if (/hair/.test(meshName)) mat.roughness = Math.max(mat.roughness, 0.55);
        if (mat.transparent) {
          // Hair cards / lashes: cut-out instead of blending avoids sorting glitches.
          mat.alphaTest = Math.max(mat.alphaTest, 0.4);
          mat.transparent = false;
          mat.depthWrite = true;
          mat.side = THREE.DoubleSide;
        }
        if (isGarment || /dress|skirt|cloth|fabric|gown|top|shirt|jacket|hair|denim|cotton|oxford|rib/.test(meshName)) {
          mat.side = THREE.DoubleSide;
        }
        mat.needsUpdate = true;
      }
    });
    const clothNamed = isGarment || /dress|skirt|cloth|fabric|gown|denim|cotton|oxford|rib|silk|satin|lace/.test(meshName);
    mats.forEach((mat) => applyGpuWind(mat, windUniforms, clothNamed ? 1 : 0.5));
  });
}

/** Loads a GLB (plus a mannequin body for outfit-only files), normalizes size and adds idle + blow motion. */
export async function loadGLBCharacter(
  preset: CharacterPreset,
  path: string,
): Promise<CharacterRig> {
  const loader = getLoader();
  const isGarment = preset.kind === 'garment';
  const [gltf, bodyGltf] = await Promise.all([
    loader.loadAsync(path),
    isGarment && preset.mannequin ? loader.loadAsync(preset.mannequin) : Promise.resolve(null),
  ]);
  const group = new THREE.Group();
  const model = gltf.scene;

  const targetHeight = isGarment ? preset.garmentHeight ?? 1.45 : 1.72;
  // Garment top sits at shoulder height; long gowns reach the floor.
  const lift = isGarment ? Math.max(0.03, 1.46 - targetHeight) : 0;
  normalizeModel(model, targetHeight, lift, isGarment ? preset.offset : undefined);

  const windUniforms: WindUniforms = {
    uWind: { value: 0 },
    uTime: { value: 0 },
    uHemLo: { value: isGarment ? lift : 0.3 },
    uHemHi: { value: isGarment ? lift + targetHeight * 0.85 : 1.05 },
  };
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  gltf.animations.forEach((clip) => mixer?.clipAction(clip).play());

  if (bodyGltf) {
    const bodyModel = bodyGltf.scene;
    normalizeModel(bodyModel, 1.72, 0);
    styleModel(bodyModel, false, windUniforms);
    group.add(bodyModel);
  }
  styleModel(model, isGarment, windUniforms);
  group.add(model);
  group.updateMatrixWorld(true);

  const body = new THREE.Group();
  group.add(body);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.22, 1.42, 0);
  group.add(leftArm);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.22, 1.42, 0);
  group.add(rightArm);
  const leftHand = new THREE.Object3D();
  const rightHand = new THREE.Object3D();
  leftArm.add(leftHand);
  rightArm.add(rightHand);
  const head = new THREE.Object3D();
  head.position.y = 1.65;
  group.add(head);

  const holdTarget = new THREE.Vector3(0, 0.82, 0.12);
  const boneTargets: Array<{ bone: THREE.Bone; base: THREE.Euler; side: 'left' | 'right' }> = [];
  model.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh)) return;
    obj.skeleton.bones.forEach((bone) => {
      const n = bone.name.toLowerCase().replace(/[^a-z]/g, '');
      if (/left.*(arm|forearm)|upperarmleft|lowerarmleft/.test(n)) {
        boneTargets.push({ bone, base: bone.rotation.clone(), side: 'left' });
      } else if (/right.*(arm|forearm)|upperarmright|lowerarmright/.test(n)) {
        boneTargets.push({ bone, base: bone.rotation.clone(), side: 'right' });
      }
    });
  });

  const update = (dt: number, time: number, wind01: number) => {
    const w = THREE.MathUtils.clamp(wind01, 0, 1);
    mixer?.update(Math.min(dt, 0.05));
    // Exactly zero wind unless the user is really blowing.
    windUniforms.uWind.value = w < 0.03 ? 0 : 0.15 + Math.pow(w, 1.2) * 0.85;
    windUniforms.uTime.value = time;
    boneTargets.forEach(({ bone, base, side }) => {
      const hold = THREE.MathUtils.smoothstep(w, 0.18, 0.82);
      const sign = side === 'left' ? 1 : -1;
      bone.rotation.x = base.x + hold * 0.45;
      bone.rotation.z = base.z + sign * hold * 0.72;
    });
    // Idle life (always): breathing, weight shift, slow turn. Body bend/twist is in the shader.
    const breath = Math.sin(time * 1.7);
    group.scale.y = 1 + 0.006 * breath;
    const targetLean = -0.07 * w;
    group.rotation.x += (targetLean - group.rotation.x) * Math.min(1, dt * 4);
    group.rotation.z = Math.sin(time * 0.8) * 0.028 + Math.sin(time * 3.1) * 0.02 * w;
    group.rotation.y = Math.sin(time * 0.45) * 0.14 + Math.sin(time * 0.17 + 1.0) * 0.07 + Math.sin(time * 1.9) * 0.035 * w;
    group.position.x = Math.sin(time * 0.6) * 0.025 + Math.sin(time * 2.3) * 0.015 * w;
  };

  const dispose = () => {
    mixer?.stopAllAction();
    mixer?.uncacheRoot(model);
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
  };

  return {
    group, body, leftArm, rightArm, leftHand, rightHand, head,
    hairRoots: [], holdTarget, update, dispose,
  };
}
