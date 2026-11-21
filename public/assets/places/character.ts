import * as THREE from 'three';

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
  /** Optional animation hook used by imported GLB rigs. */
  update?: (dt: number, time: number, wind01: number) => void;
  dispose: () => void;
}

