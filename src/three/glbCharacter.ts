import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';


type WindUniforms = { uWind: { value: number }; uTime: { value: number } };

/** Cheap GPU wind: lower part of the outfit lifts and flutters. Works with skinned meshes. */
function applyGpuWind(
  mat: THREE.Material,
  u: WindUniforms,
  weight: number,
  _mesh: THREE.Mesh,
) {
  if (weight <= 0) return;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWeight = { value: weight };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWind; uniform float uTime; uniform float uWeight;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
float nY = clamp((wPos.y - 0.42) / 0.72, 0.0, 1.0);
float hem = pow(1.0 - nY, 1.7) * uWeight * smoothstep(0.12, 0.45, wPos.y);
float ph = uTime * 7.0 + wPos.x * 9.0 + wPos.z * 6.0;
float gust = 0.5 + 0.5 * sin(uTime * 8.2);
vec3 wDisp = vec3(
  sin(ph * 0.7) * 0.07 * uWind * hem,
  (0.12 * uWind * gust + sin(ph) * 0.018 * uWind) * hem,
  sin(ph * 0.9 + 1.3) * 0.05 * uWind * hem
);
transformed += inverse(mat3(modelMatrix)) * wDisp;
#include <project_vertex>`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${weight}`;
  mat.needsUpdate = true;
}

/** Loads a GLB, normalizes it to a common height, and adds a restrained wind response. */
export async function loadGLBCharacter(
  _preset: CharacterPreset,
  path: string,
): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(path);
  const group = new THREE.Group();
  const model = gltf.scene;

  // Normalize before adding to the live scene; use the unscaled bounds for reliable feet placement.
  model.updateMatrixWorld(true);
  const originalBox = new THREE.Box3().setFromObject(model);
  const originalSize = originalBox.getSize(new THREE.Vector3());
  if (!Number.isFinite(originalSize.y) || originalSize.y < 0.01) {
    throw new Error(`Invalid character dimensions: ${path}`);
  }
  const scale = 1.72 / originalSize.y;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  model.updateMatrixWorld(true);

  const modelHeight = 1.72;
  const windUniforms = { uWind: { value: 0 }, uTime: { value: 0 } };
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  gltf.animations.forEach((clip) => mixer?.clipAction(clip).play());

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        mat.roughness = Math.max(0.48, Math.min(mat.roughness ?? 0.75, 0.9));
        mat.envMapIntensity = 0.8;
        mat.needsUpdate = true;
      }
    });

    const name = `${mesh.name} ${mats.map((m) => m.name).join(' ')}`.toLowerCase();
    const skinLike = /skin|body|face|head|leg|arm|hand|foot|feet|eye|teeth|lash|brow|nail/.test(name);
    const clothNamed = /dress|skirt|cloth|fabric|gown|top|shirt|jacket|hair/.test(name);
    const weight = clothNamed ? 1 : skinLike ? 0 : 0.6;
    mats.forEach((mat) => applyGpuWind(mat, windUniforms, weight, mesh));
  });

  group.add(model);
  model.updateMatrixWorld(true);

  // Fallback anchors are used by procedural systems; imported models without a skeleton keep their
  // authored pose rather than displaying fake floating arms.
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
    windUniforms.uWind.value = Math.pow(w, 1.35);
    windUniforms.uTime.value = time;
    // Only animated if the downloaded model actually contains named arm bones.
    const hold = THREE.MathUtils.smoothstep(w, 0.18, 0.82);
    boneTargets.forEach(({ bone, base, side }) => {
      const sign = side === 'left' ? 1 : -1;
      bone.rotation.x = base.x + hold * 0.45;
      bone.rotation.z = base.z + sign * hold * 0.72;
    });
    group.rotation.z = Math.sin(time * 2.5) * 0.018 * w;
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
