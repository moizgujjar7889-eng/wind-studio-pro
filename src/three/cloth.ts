import * as THREE from 'three';

export interface ClothParticle {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  pinned: boolean;
}

export interface SkirtCloth {
  particles: ClothParticle[];
  cols: number;
  rows: number;
  geometry: THREE.BufferGeometry;
  indices: number[];
}

/**
 * Create a cylindrical skirt mesh with pinned waist row.
 * Particles are simulated with Verlet integration.
 */
export function createSkirt(opts: {
  cols: number;
  rows: number;
  waistY: number;
  hemY: number;
  waistRx: number;
  waistRz: number;
  hemScale: number;
}): SkirtCloth {
  const { cols, rows, waistY, hemY, waistRx, waistRz, hemScale } = opts;
  const particles: ClothParticle[] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = waistY + (hemY - waistY) * t;
    const scale = 1 + (hemScale - 1) * Math.pow(t, 1.15);
    const rx = waistRx * scale;
    const rz = waistRz * scale;

    for (let c = 0; c < cols; c++) {
      const a = (c / cols) * Math.PI * 2;
      const x = Math.sin(a) * rx;
      const z = Math.cos(a) * rz;
      const pos = new THREE.Vector3(x, y, z);
      particles.push({
        pos: pos.clone(),
        prev: pos.clone(),
        pinned: r === 0,
      });
      positions.push(x, y, z);
      uvs.push(c / cols, t);
    }
  }

  // Quads → triangles
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const i0 = r * cols + c;
      const i1 = r * cols + ((c + 1) % cols);
      const i2 = (r + 1) * cols + c;
      const i3 = (r + 1) * cols + ((c + 1) % cols);
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { particles, cols, rows, geometry, indices };
}

export interface HairStrand {
  particles: ClothParticle[];
  geometry: THREE.BufferGeometry;
}

/**
 * Simple hair strands that react to wind.
 */
export function createHairStrands(opts: {
  roots: THREE.Vector3[];
  segLen: number;
  links: number;
  dir: THREE.Vector3;
}): { strands: HairStrand[]; geometry: THREE.BufferGeometry } {
  const strands: HairStrand[] = [];
  const allPos: number[] = [];
  const allIdx: number[] = [];
  let vertOffset = 0;

  for (const root of opts.roots) {
    const particles: ClothParticle[] = [];
    for (let i = 0; i < opts.links; i++) {
      const pos = root
        .clone()
        .add(opts.dir.clone().multiplyScalar(i * opts.segLen));
      particles.push({
        pos: pos.clone(),
        prev: pos.clone(),
        pinned: i === 0,
      });
      allPos.push(pos.x, pos.y, pos.z);
    }

    // Line indices
    for (let i = 0; i < opts.links - 1; i++) {
      allIdx.push(vertOffset + i, vertOffset + i + 1);
    }
    vertOffset += opts.links;
    strands.push({
      particles,
      geometry: new THREE.BufferGeometry(), // individual not used
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  geometry.setIndex(allIdx);

  return { strands, geometry };
}

/**
 * Verlet step for a particle list with distance constraints.
 */
export function verletStep(
  particles: ClothParticle[],
  gravity: number,
  wind: THREE.Vector3,
  damping: number,
  dt: number,
) {
  const dt2 = dt * dt;
  for (const p of particles) {
    if (p.pinned) continue;
    const vx = (p.pos.x - p.prev.x) * damping;
    const vy = (p.pos.y - p.prev.y) * damping;
    const vz = (p.pos.z - p.prev.z) * damping;
    p.prev.copy(p.pos);
    p.pos.x += vx + wind.x * dt2;
    p.pos.y += vy + gravity * dt2 + wind.y * dt2;
    p.pos.z += vz + wind.z * dt2;
  }
}

export function satisfyDistance(
  a: ClothParticle,
  b: ClothParticle,
  rest: number,
  stiffness = 0.9,
) {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
  const diff = (dist - rest) / dist;
  const corr = diff * 0.5 * stiffness;
  if (!a.pinned) {
    a.pos.x += dx * corr;
    a.pos.y += dy * corr;
    a.pos.z += dz * corr;
  }
  if (!b.pinned) {
    b.pos.x -= dx * corr;
    b.pos.y -= dy * corr;
    b.pos.z -= dz * corr;
  }
}
