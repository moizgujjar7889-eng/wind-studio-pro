import * as THREE from 'three';
import type { CharacterRig } from './character';
import {
  createSkirt,
  createHairStrands,
  verletStep,
  satisfyDistance,
  type ClothParticle,
} from './cloth';

const WIND_DIR = new THREE.Vector3(-1, 0.15, 0.35).normalize();
const tmpWind = new THREE.Vector3();

export interface DressSimulation {
  update(dt: number, time: number, wind01: number): void;
  dispose(): void;
}

/**
 * Cloth + hair + hand-hold simulation.
 * Strong wind lifts the hem significantly.
 * Hands rise to hold the skirt/dress down.
 */
export function createDressSimulation(
  rig: CharacterRig,
  scene: THREE.Scene,
  opts: {
    dressColor: string;
    accentColor: string;
    hairColor: string;
    dressLength: number;
    fit: number;
    style?: string;
  },
): DressSimulation {
  const cols = 20;
  const isTrousers = opts.style === 'trousers_top';
  const rows = isTrousers ? 7 : 11;

  const waistWorldY = 1.02;
  const lengthMul = isTrousers ? 0.55 : opts.dressLength;
  const hemY = waistWorldY - 0.98 * lengthMul;
  const baseHemScale = isTrousers ? 1.2 : opts.fit < 0.45 ? 2.25 : 1.55;

  const { particles, cols: c, rows: r, geometry: skirtGeo } = createSkirt({
    cols,
    rows,
    waistY: waistWorldY,
    hemY,
    waistRx: 0.145,
    waistRz: 0.135,
    hemScale: baseHemScale,
  });

  const dressMat = new THREE.MeshStandardMaterial({
    color: opts.dressColor,
    roughness: 0.82,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, dressMat);
  skirtMesh.frustumCulled = false;
  skirtMesh.castShadow = true;
  scene.add(skirtMesh);

  // Rest lengths for structural constraints
  const restStruct: number[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const i = row * c + col;
      // Horizontal
      const next = row * c + ((col + 1) % c);
      restStruct.push(particles[i].pos.distanceTo(particles[next].pos));
      // Vertical
      if (row < r - 1) {
        const below = (row + 1) * c + col;
        restStruct.push(particles[i].pos.distanceTo(particles[below].pos));
      }
    }
  }

  // Hair
  const hair = createHairStrands({
    roots: rig.hairRoots.map((v) => v.clone()),
    segLen: 0.075,
    links: 11,
    dir: new THREE.Vector3(0, -0.03, 0.05),
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: opts.hairColor,
    roughness: 0.35,
    metalness: 0.06,
  });
  const hairMesh = new THREE.Mesh(hair.geometry, hairMat);
  hairMesh.frustumCulled = false;
  scene.add(hairMesh);

  // Hair rest lengths
  const hairRests: number[][] = hair.strands.map((s) => {
    const rests: number[] = [];
    for (let i = 0; i < s.particles.length - 1; i++) {
      rests.push(s.particles[i].pos.distanceTo(s.particles[i + 1].pos));
    }
    return rests;
  });

  // Precompute hem indices
  const hemIdx: number[] = [];
  for (let col = 0; col < c; col++) {
    hemIdx.push((r - 1) * c + col);
  }

  // Hand hold state
  let holdBlend = 0;

  const gravity = -7.2;
  const damping = 0.965;

  function update(dt: number, time: number, wind01: number) {
    // Clamp & shape wind
    const w = Math.max(0, Math.min(1, wind01));
    // Strong non-linear response so heavy blow lifts a lot
    const lift = Math.pow(w, 1.15) * 1.45;

    // Wind force vector (stronger upward + sideways when high)
    tmpWind.copy(WIND_DIR).multiplyScalar(18 * lift);
    tmpWind.y += 13 * lift * lift; // extra upward lift on strong blow

    // Small turbulence
    tmpWind.x += Math.sin(time * 7.3) * 1.8 * lift;
    tmpWind.z += Math.cos(time * 5.1) * 1.4 * lift;

    // ---- Skirt Verlet ----
    verletStep(particles, gravity, tmpWind, damping, dt);

    // Structural constraints (multiple iterations for stability)
    for (let iter = 0; iter < 4; iter++) {
      let ri = 0;
      for (let row = 0; row < r; row++) {
        for (let col = 0; col < c; col++) {
          const i = row * c + col;
          const next = row * c + ((col + 1) % c);
          satisfyDistance(particles[i], particles[next], restStruct[ri++], 0.92);
          if (row < r - 1) {
            const below = (row + 1) * c + col;
            satisfyDistance(particles[i], particles[below], restStruct[ri++], 0.9);
          }
        }
      }
    }

    // Extra shear constraints on lower rows for more natural flare
    if (lift > 0.15) {
      for (let row = Math.floor(r * 0.4); row < r - 1; row++) {
        for (let col = 0; col < c; col++) {
          const i = row * c + col;
          const diag = (row + 1) * c + ((col + 1) % c);
          const rest = particles[i].pos.distanceTo(particles[diag].pos) * 0.98;
          satisfyDistance(particles[i], particles[diag], rest, 0.35);
        }
      }
    }

    // Keep waist pinned & gently pull hem outward with wind
    for (let col = 0; col < c; col++) {
      const p = particles[col];
      p.pos.set(
        Math.sin((col / c) * Math.PI * 2) * 0.145,
        waistWorldY,
        Math.cos((col / c) * Math.PI * 2) * 0.135,
      );
      p.prev.copy(p.pos);
    }

    // Strong wind pushes hem particles more
    if (lift > 0.2) {
      for (const hi of hemIdx) {
        const p = particles[hi];
        if (p.pinned) continue;
        p.pos.x += WIND_DIR.x * 0.012 * lift;
        p.pos.y += 0.008 * lift * lift;
        p.pos.z += WIND_DIR.z * 0.01 * lift;
      }
    }

    // Write positions back to geometry
    const posAttr = skirtGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i].pos;
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
    skirtGeo.computeVertexNormals();

    // ---- Hair ----
    const hairWind = tmpWind.clone().multiplyScalar(0.55);
    hairWind.y *= 0.4;
    for (let s = 0; s < hair.strands.length; s++) {
      const strand = hair.strands[s];
      verletStep(strand.particles, gravity * 0.7, hairWind, 0.94, dt);
      for (let i = 0; i < strand.particles.length - 1; i++) {
        satisfyDistance(
          strand.particles[i],
          strand.particles[i + 1],
          hairRests[s][i],
          0.95,
        );
      }
      // Re-pin root
      strand.particles[0].pos.copy(rig.hairRoots[s] || strand.particles[0].pos);
      strand.particles[0].prev.copy(strand.particles[0].pos);
    }

    // Update hair geometry
    const hPos = hair.geometry.getAttribute('position') as THREE.BufferAttribute;
    let idx = 0;
    for (const strand of hair.strands) {
      for (const p of strand.particles) {
        hPos.setXYZ(idx++, p.pos.x, p.pos.y, p.pos.z);
      }
    }
    hPos.needsUpdate = true;

    // ---- Hand hold animation ----
    // Hands rise and move toward the hem when wind is strong
    const targetHold = THREE.MathUtils.smoothstep(w, 0.18, 0.78);
    holdBlend += (targetHold - holdBlend) * Math.min(1, dt * 6);

    // Left arm
    const leftRaise = holdBlend * 1.38;
    const leftIn = holdBlend * 0.72;
    rig.leftArm.rotation.z = 0.25 - leftRaise * 0.95;
    rig.leftArm.rotation.x = leftIn * 0.7;
    rig.leftArm.rotation.y = holdBlend * 0.35;

    // Right arm (mirror)
    rig.rightArm.rotation.z = -0.25 + leftRaise * 0.95;
    rig.rightArm.rotation.x = leftIn * 0.7;
    rig.rightArm.rotation.y = -holdBlend * 0.35;

    // Slight body lean against wind
    rig.body.rotation.z = -0.04 * lift;
    rig.body.rotation.x = 0.03 * lift;

    // Head looks slightly into the wind / down when holding
    rig.head.rotation.x = -0.08 * holdBlend;
    rig.head.rotation.y = 0.12 * lift;
  }

  function dispose() {
    scene.remove(skirtMesh);
    scene.remove(hairMesh);
    skirtGeo.dispose();
    dressMat.dispose();
    hair.geometry.dispose();
    hairMat.dispose();
  }

  return { update, dispose };
}
