import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';
import { WIND_MIN } from '../lib/windEngine';


type WindUniforms = {
  uWind: { value: number };
  uTime: { value: number };
  uHemLo: { value: number };
  uHemHi: { value: number };
  /** how much the hem rises (long gowns rise less, they touch the floor) */
  uLift: { value: number };
};

/**
 * Mannequin "lining": skin-coloured body parts that sit under a garment are tinted with the
 * garment's own colour between lo and hi (world height), so a gap in the dress shows fabric
 * instead of a body. Above hi (neck) and below lo (shins / feet of a short dress) skin stays.
 */
type UnderLayer = { color: THREE.Color; lo: number; hi: number };

/**
 * GPU vertex motion (no skeleton needed):
 *  1. idle life  - always on, rigid body motion shared by body and garment:
 *     breathing, weight shift (hips one way, shoulders the other), spine twist, head turn + nod.
 *     The hem does NOT move on its own here, so with wind == 0 cloth only follows the body.
 *  2. blow wind  - only when uWind > 0 and weight > 0: hem lifts and flares outward in folds,
 *     stronger on the downwind side (-x, same direction as the particles).
 * weight: 1 = cloth, 0.5 = mixed (full-body characters), 0 = never moved by wind (mannequin body).
 */
function applyGpuWind(mat: THREE.Material, u: WindUniforms, weight: number, under?: UnderLayer) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uHemLo = u.uHemLo;
    shader.uniforms.uHemHi = u.uHemHi;
    shader.uniforms.uLift = u.uLift;
    shader.uniforms.uWeight = { value: weight };
    if (under) {
      shader.uniforms.uUnderColor = { value: under.color };
      shader.uniforms.uUnderLo = { value: under.lo };
      shader.uniforms.uUnderHi = { value: under.hi };
    }
    const underDecl = under ? 'varying float vUnderY;' : '';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWind; uniform float uTime; uniform float uWeight; uniform float uHemLo; uniform float uHemHi; uniform float uLift;
${underDecl}
vec2 rot2(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y) - p; }`,
      )
      .replace(
        '#include <project_vertex>',
        `vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
${under ? 'vUnderY = wPos.y;' : ''}
float y = wPos.y;
float t = uTime;
float rad = length(wPos.xz);
vec2 dirR = rad > 0.001 ? wPos.xz / rad : vec2(0.0);
vec3 wDisp = vec3(0.0);

// ---- idle: breathing (~4 s), weight shift (~9 s), spine twist, head turn / nod ----
float breath = sin(t * 1.6) * 0.8 + sin(t * 0.8 + 1.0) * 0.2;
float shift = sin(t * 0.7) * 0.75 + sin(t * 0.29 + 2.0) * 0.25;
// feet stay planted: pelvis slides sideways, shoulders lean back the other way (contrapposto)
float hipW = smoothstep(0.12, 0.95, y);
float rollW = smoothstep(0.95, 1.25, y);
wDisp.x += shift * 0.024 * hipW - shift * 0.045 * (y - 0.95) * rollW;
wDisp.y += shift * 0.045 * wPos.x * rollW;
// chest / belly breathing: slight expansion, shoulders rise a few mm
float torsoMask = 1.0 - smoothstep(0.20, 0.34, rad);
float chestW = smoothstep(1.05, 1.25, y) * (1.0 - smoothstep(1.42, 1.58, y)) * torsoMask;
float bellyW = smoothstep(0.85, 1.0, y) * (1.0 - smoothstep(1.10, 1.25, y)) * torsoMask;
wDisp.xz += dirR * rad * 0.03 * breath * chestW;
wDisp.z += breath * (0.005 * chestW + 0.003 * bellyW);
wDisp.y += breath * 0.004 * smoothstep(1.30, 1.50, y);
// upper-body twist + head turn (rotation around the vertical axis)
float tw = (sin(t * 0.5) * 0.05 + sin(t * 0.21 + 1.0) * 0.03) * smoothstep(0.90, 1.45, y);
float headW = smoothstep(1.50, 1.62, y);
float hd = (sin(t * 0.37 + 0.5) * 0.11 + sin(t * 0.93 + 2.0) * 0.025) * headW;
vec2 rd = rot2(wPos.xz, tw + hd);
wDisp.x += rd.x;
wDisp.z += rd.y;
// head nod + slight tilt
float nod = sin(t * 0.29 + 0.7) * 0.05 + breath * 0.008;
wDisp.z += (y - 1.5) * nod * headW;
wDisp.x += (y - 1.5) * sin(t * 0.23 + 1.3) * 0.03 * headW;

// ---- blow wind: ONLY when uWind > 0 (the app sends exactly 0 when nobody blows) ----
if (uWind > 0.001 && uWeight > 0.01) {
  float nY = clamp((y - uHemLo) / max(uHemHi - uHemLo, 0.1), 0.0, 1.0);
  float mask = uWeight > 0.99 ? 1.0 : smoothstep(0.2, 0.3, rad) * (1.0 - smoothstep(0.95, 1.1, y));
  float hem = pow(1.0 - nY, 1.5) * mask;
  float ang = atan(wPos.z, wPos.x);
  float gust = 0.5 + 0.5 * sin(t * 6.1 + y * 2.0 + sin(t * 1.3) * 1.5);
  // folds travelling around the skirt (integer multiples keep the seam at +-pi continuous)
  float fold = 0.6 + 0.25 * sin(ang * 4.0 + t * 2.3) + 0.15 * sin(ang * 7.0 - t * 3.4);
  // wind blows toward -x: the downwind side billows more than the upwind side
  float side = 0.6 + 0.5 * (0.5 - 0.5 * dirR.x);
  float flare = 0.30 * uWind * hem * (0.45 + 0.55 * gust) * fold * side;
  // always >= 0, so the hem never sinks into the floor
  float lift = uLift * uWind * hem * (0.10 + 0.28 * gust + 0.03 * sin(t * 9.0 + ang * 5.0));
  vec2 tang = vec2(-dirR.y, dirR.x);
  float swirl = sin(ang * 3.0 - t * 4.5) * 0.03 * uWind * hem;
  wDisp.xz += dirR * flare + tang * swirl;
  wDisp.y += lift;
}
transformed += inverse(mat3(modelMatrix)) * wDisp;
#include <project_vertex>`,
      );
    if (under) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uUnderColor; uniform float uUnderLo; uniform float uUnderHi;
varying float vUnderY;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
float underMask = smoothstep(uUnderLo - 0.04, uUnderLo + 0.02, vUnderY) * (1.0 - smoothstep(uUnderHi - 0.08, uUnderHi, vUnderY));
diffuseColor.rgb = mix(diffuseColor.rgb, uUnderColor, underMask);`,
        );
    }
  };
  mat.customProgramCacheKey = () => `wind5-${weight}-${under ? 'u' : 'n'}`;
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

/** Flat skin tone of the mannequin (average of its leg texture). */
const MANNEQUIN_SKIN = '#e2b19c';

type StyleOpts = {
  /** 0 = wind never moves this model (mannequin body), see applyGpuWind */
  windWeight?: number;
  /** mannequin only: tint torso/legs under the garment with the garment colour */
  under?: UnderLayer;
};

/**
 * Average colour the garment really shows: its texture sampled at the mesh UVs
 * (not the whole image, which often has black padding). Returns a slightly darkened
 * colour, like a lining sitting in the shade under the outer cloth.
 */
function sampleGarmentColor(model: THREE.Object3D): THREE.Color | null {
  const N = 96;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    const uv = mesh.geometry.getAttribute('uv');
    const img = mat.map?.image as unknown as CanvasImageSource | undefined;
    if (!uv || !img) {
      const rgb = { r: 0, g: 0, b: 0 };
      mat.color.getRGB(rgb, THREE.SRGBColorSpace);
      r += rgb.r * 255;
      g += rgb.g * 255;
      b += rgb.b * 255;
      n++;
      return;
    }
    try {
      ctx.clearRect(0, 0, N, N);
      ctx.drawImage(img, 0, 0, N, N);
      const px = ctx.getImageData(0, 0, N, N).data;
      const step = Math.max(1, Math.floor(uv.count / 2500));
      for (let i = 0; i < uv.count; i += step) {
        const u = uv.getX(i) - Math.floor(uv.getX(i));
        const v = uv.getY(i) - Math.floor(uv.getY(i));
        const k = (Math.min(N - 1, Math.floor(v * N)) * N + Math.min(N - 1, Math.floor(u * N))) * 4;
        if (px[k + 3] < 128) continue;
        r += px[k];
        g += px[k + 1];
        b += px[k + 2];
        n++;
      }
    } catch {
      /* unreadable texture: fall back below */
    }
  });
  if (n === 0) return null;
  const k = 0.8 / (255 * n);
  return new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace);
}

function styleModel(model: THREE.Object3D, isGarment: boolean, windUniforms: WindUniforms, opts: StyleOpts = {}) {
  const doneTex = new Set<THREE.Texture>();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true; // shadow bias/normalBias in windScene prevents stripes
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshName = `${mesh.name} ${mats.map((m) => m.name).join(' ')}`.toLowerCase();
    // mannequin-anna.glb: Material13458 = torso (texture has painted underwear), Material13466 = legs
    const isTorso = !!opts.under && /material13458/.test(meshName);
    const isLegs = !!opts.under && /material13466/.test(meshName);
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
          if (isGarment) {
            // Cloth is never see-through. Cutting at alphaTest 0.4 punched holes into BLEND gowns
            // (navy court gown has texels with alpha 0), so garments are drawn fully opaque.
            mat.transparent = false;
            mat.alphaTest = 0;
            mat.opacity = 1;
            mat.depthWrite = true;
            mat.side = THREE.DoubleSide;
          } else {
            // Hair cards / lashes: cut-out instead of blending avoids sorting glitches.
            mat.alphaTest = Math.max(mat.alphaTest, 0.4);
            mat.transparent = false;
            mat.depthWrite = true;
            mat.side = THREE.DoubleSide;
          }
        }
        if (isGarment || /dress|skirt|cloth|fabric|gown|top|shirt|jacket|hair|denim|cotton|oxford|rib/.test(meshName)) {
          mat.side = THREE.DoubleSide;
        }
        if (isTorso) {
          // plain skin instead of the painted bra / underwear
          mat.map = null;
          mat.color.set(MANNEQUIN_SKIN);
        }
        mat.needsUpdate = true;
      }
    });
    const clothNamed = isGarment || /dress|skirt|cloth|fabric|gown|denim|cotton|oxford|rib|silk|satin|lace/.test(meshName);
    const weight = opts.windWeight ?? (clothNamed ? 1 : 0.5);
    const under = isTorso || isLegs ? opts.under : undefined;
    mats.forEach((mat) => applyGpuWind(mat, windUniforms, weight, under));
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
    uLift: { value: isGarment && targetHeight > 1.0 ? 0.45 : 1 },
  };
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  gltf.animations.forEach((clip) => mixer?.clipAction(clip).play());

  if (bodyGltf) {
    const bodyModel = bodyGltf.scene;
    normalizeModel(bodyModel, 1.72, 0);
    // The mannequin must never look undressed: torso/legs under the garment take the garment colour,
    // and the painted underwear of the torso texture is replaced by plain skin.
    const garmentTop = lift + targetHeight;
    const lining = sampleGarmentColor(model) ?? new THREE.Color('#6b6b70');
    const under: UnderLayer = {
      color: lining,
      // long gowns: lining from the knee up (the hem may lift); short dresses: from the hem up
      lo: targetHeight > 1.0 ? 0.5 : lift,
      hi: garmentTop,
    };
    // wind never moves the mannequin itself, only the garment
    styleModel(bodyModel, false, windUniforms, { windWeight: 0, under });
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
    // Exactly zero wind unless the user is really blowing (mic gate) or using the slider.
    const w = THREE.MathUtils.clamp(wind01, 0, 1);
    const blowing = w >= WIND_MIN;
    const eff = blowing ? w : 0;
    mixer?.update(Math.min(dt, 0.05));
    windUniforms.uWind.value = blowing ? Math.pow(w, 0.85) : 0;
    windUniforms.uTime.value = time;
    boneTargets.forEach(({ bone, base, side }) => {
      const hold = THREE.MathUtils.smoothstep(eff, 0.18, 0.82);
      const sign = side === 'left' ? 1 : -1;
      bone.rotation.x = base.x + hold * 0.45;
      bone.rotation.z = base.z + sign * hold * 0.72;
    });
    // Idle life (always): breathing, weight shift, spine twist and head motion run in the vertex
    // shader (applyGpuWind). Here only a slow turn in place; the feet stay planted (no sliding, no scaling).
    const targetLean = -0.07 * eff;
    group.rotation.x += (targetLean - group.rotation.x) * Math.min(1, dt * 4);
    group.rotation.z = Math.sin(time * 3.1) * 0.02 * eff;
    group.rotation.y = Math.sin(time * 0.45) * 0.09 + Math.sin(time * 0.17 + 1.0) * 0.05 + Math.sin(time * 1.9) * 0.03 * eff;
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
