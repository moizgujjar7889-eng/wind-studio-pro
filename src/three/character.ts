import * as THREE from 'three';
import type { CharacterPreset } from '../lib/types';

export interface CharacterRig {
  group: THREE.Group;
  body: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  head: THREE.Object3D;
  hairRoots: THREE.Vector3[];
  /** Target for hand hold animation (waist / hem area) */
  holdTarget: THREE.Vector3;
  dispose: () => void;
}

/**
 * Procedural adult female character (18+ proportions).
 * Clear adult body ratios — not child or teen.
 */
export function createCharacter(preset: CharacterPreset): CharacterRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skinMat = new THREE.MeshStandardMaterial({
    color: preset.skinTone,
    roughness: 0.72,
    metalness: 0.02,
  });

  const clothMat = new THREE.MeshStandardMaterial({
    color: preset.dressColor,
    roughness: 0.82,
    metalness: 0.03,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: preset.accentColor,
    roughness: 0.7,
    metalness: 0.05,
  });

  // ---- Torso (adult proportions) ----
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.42, 6, 12),
    skinMat,
  );
  torso.position.y = 1.28;
  body.add(torso);

  // Bust volume (adult)
  const bust = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 10),
    skinMat,
  );
  bust.scale.set(1.15, 0.85, 0.9);
  bust.position.set(0, 1.42, 0.08);
  body.add(bust);

  // Hips (adult female)
  const hips = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 10),
    skinMat,
  );
  hips.scale.set(1.35, 0.7, 1.05);
  hips.position.y = 1.02;
  body.add(hips);

  // ---- Neck & Head ----
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10),
    skinMat,
  );
  neck.position.y = 1.58;
  body.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 16, 14),
    skinMat,
  );
  head.position.y = 1.72;
  head.scale.set(0.95, 1.05, 0.95);
  body.add(head);

  // Simple face features
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a120e', roughness: 0.3 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat);
  leftEye.position.set(-0.04, 1.74, 0.1);
  body.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.04;
  body.add(rightEye);

  // ---- Hair (simple volume) ----
  const hairMat = new THREE.MeshStandardMaterial({
    color: preset.hairColor,
    roughness: 0.4,
    metalness: 0.05,
  });
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 12, 10),
    hairMat,
  );
  hairTop.position.y = 1.78;
  hairTop.scale.set(1.05, 0.9, 1.0);
  body.add(hairTop);

  // Hair roots for strand simulation
  const hairRoots: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 0.08;
    hairRoots.push(
      new THREE.Vector3(Math.sin(a) * r, 1.82 + (i % 3) * 0.02, Math.cos(a) * r * 0.7 - 0.02),
    );
  }

  // ---- Arms ----
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.22, 1.48, 0);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.22, 1.48, 0);
  body.add(rightArm);

  const upperArmGeo = new THREE.CapsuleGeometry(0.04, 0.28, 4, 8);
  const lowerArmGeo = new THREE.CapsuleGeometry(0.035, 0.26, 4, 8);
  const handGeo = new THREE.SphereGeometry(0.038, 8, 6);

  // Left arm
  const leftUpper = new THREE.Mesh(upperArmGeo, skinMat);
  leftUpper.position.set(0, -0.16, 0);
  leftArm.add(leftUpper);
  const leftLower = new THREE.Mesh(lowerArmGeo, skinMat);
  leftLower.position.set(0, -0.42, 0);
  leftArm.add(leftLower);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(0, -0.58, 0);
  leftArm.add(leftHand);

  // Right arm
  const rightUpper = new THREE.Mesh(upperArmGeo, skinMat);
  rightUpper.position.set(0, -0.16, 0);
  rightArm.add(rightUpper);
  const rightLower = new THREE.Mesh(lowerArmGeo, skinMat);
  rightLower.position.set(0, -0.42, 0);
  rightArm.add(rightLower);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.set(0, -0.58, 0);
  rightArm.add(rightHand);

  // Default arm pose (slightly out)
  leftArm.rotation.z = 0.25;
  rightArm.rotation.z = -0.25;

  // ---- Legs ----
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.55, 4, 8);
  const leftLeg = new THREE.Mesh(legGeo, skinMat);
  leftLeg.position.set(-0.09, 0.55, 0);
  body.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, skinMat);
  rightLeg.position.set(0.09, 0.55, 0);
  body.add(rightLeg);

  // Simple shoes
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.6 });
  const shoeGeo = new THREE.BoxGeometry(0.1, 0.05, 0.18);
  const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
  leftShoe.position.set(-0.09, 0.04, 0.02);
  body.add(leftShoe);
  const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
  rightShoe.position.set(0.09, 0.04, 0.02);
  body.add(rightShoe);

  // Top clothing piece (blouse / jacket area) – static
  if (preset.style === 'skirt_blouse' || preset.style === 'jacket_skirt' || preset.style === 'trousers_top') {
    const top = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.28, 6, 12),
      preset.style === 'jacket_skirt' ? clothMat : accentMat,
    );
    top.position.y = 1.32;
    body.add(top);
  }

  // Hold target (where hands reach when wind is strong)
  const holdTarget = new THREE.Vector3(0, 0.95, 0.12);

  const dispose = () => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
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
    hairRoots,
    holdTarget,
    dispose,
  };
}
