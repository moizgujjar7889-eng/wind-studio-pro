import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';

type DeformableMesh = {
  mesh: THREE.Mesh;
  original: Float32Array;
  localToGroup: THREE.Matrix4;
  minY: number;
  maxY: number;
  weight: number;
};

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
  const deformables: DeformableMesh[] = [];
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

    // Cloth-like vertex movement only on lower-body geometry. Preserve original vertices every frame
    // to prevent cumulative drift. If a model is one combined mesh, a smooth lower-body mask is used.
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position || !position.count) return;
    const original = new Float32Array(position.array as ArrayLike<number>);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) return;
    const name = `${mesh.name} ${mats.map((m) => m.name).join(' ')}`.toLowerCase();
    const clothNamed = /dress|skirt|cloth|fabric|gown|衣|裙/.test(name);
    const localToGroup = new THREE.Matrix4();
    const inverseGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
    localToGroup.multiplyMatrices(inverseGroup, mesh.matrixWorld);
    deformables.push({
      mesh,
      original,
      localToGroup,
      minY: bounds.min.y,
      maxY: bounds.max.y,
      weight: clothNamed ? 1 : 0.72,
    });
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
    group.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const lift = Math.pow(w, 1.35);
    const gust = 0.5 + 0.5 * Math.sin(time * 8.2);
    for (const item of deformables) {
      const attr = item.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, item.mesh.matrixWorld);
      const invTransform = transform.clone().invert();
      const v = new THREE.Vector3();
      const range = Math.max(0.001, item.maxY - item.minY);
      for (let i = 0; i < attr.count; i++) {
        const k = i * 3;
        v.set(item.original[k], item.original[k + 1], item.original[k + 2]).applyMatrix4(transform);
        const normalizedY = THREE.MathUtils.clamp((v.y - 0.42) / 0.72, 0, 1);
        // Lower hem reacts most; waist stays almost fixed. Keep movement modest to avoid tearing.
        const hemMask = Math.pow(1 - normalizedY, 1.7) * item.weight;
        const phase = time * 7 + v.x * 9 + v.z * 6;
        const flutter = Math.sin(phase) * 0.018 * lift * hemMask;
        const rise = (0.12 * lift * gust + flutter) * hemMask;
        const side = Math.sin(phase * 0.7) * 0.07 * lift * hemMask;
        // Convert wind displacement from group space into mesh local space.
        const groupPoint = v.clone();
        groupPoint.x += side;
        groupPoint.y += rise;
        const invTransform = transform.clone().invert();
        groupPoint.applyMatrix4(invTransform);
        attr.setXYZ(i, groupPoint.x, groupPoint.y, groupPoint.z);
      }
      attr.needsUpdate = true;
      item.mesh.geometry.computeVertexNormals();
    }
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
