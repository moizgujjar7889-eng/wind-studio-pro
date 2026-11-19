import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterPreset } from '../lib/types';
import type { CharacterRig } from './character';

/**
 * Load a GLB character model and adapt it to CharacterRig interface.
 * For now we keep a simple wind reaction (no full cloth sim on complex meshes).
 */
export async function loadGLBCharacter(
  preset: CharacterPreset,
  path: string,
): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(path);

  const group = new THREE.Group();
  const model = gltf.scene;

  // Normalize size & position
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Target height ~1.75 units
  const targetHeight = 1.75;
  const scale = targetHeight / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);

  // Recompute after scale
  box.setFromObject(model);
  box.getCenter(center);
  model.position.sub(center); // center to origin
  model.position.y -= box.min.y * scale; // feet on ground

  // Enable shadows
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            m.roughness = Math.min(m.roughness ?? 0.7, 0.85);
            m.metalness = m.metalness ?? 0.05;
            m.needsUpdate = true;
          }
        });
      }
    }
  });

  group.add(model);

  // Dummy nodes for compatibility with existing dressSim / hand animation
  const body = new THREE.Group();
  group.add(body);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.22, 1.45, 0);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.22, 1.45, 0);
  group.add(rightArm);

  const leftHand = new THREE.Object3D();
  leftHand.position.set(0, -0.55, 0);
  leftArm.add(leftHand);

  const rightHand = new THREE.Object3D();
  rightHand.position.set(0, -0.55, 0);
  rightArm.add(rightHand);

  const head = new THREE.Object3D();
  head.position.set(0, 1.7, 0);
  group.add(head);

  const holdTarget = new THREE.Vector3(0, 0.95, 0.15);

  const dispose = () => {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  };

  return {
    group,
    body,
    leftArm,
    rightArm,
    leftHand,
    rightHand,
    head,
    hairRoots: [],
    holdTarget,
    dispose,
  };
}
