import * as THREE from 'three';
import type { LocationPreset } from '../lib/types';

export interface EnvironmentHandle {
  setLocation(loc: LocationPreset): void;
  update(dt: number, time: number, wind01: number): void;
  dispose(): void;
}

export function createEnvironment(
  scene: THREE.Scene,
  initial: LocationPreset,
): EnvironmentHandle {
  // Sky gradient via large sphere
  const skyGeo = new THREE.SphereGeometry(80, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(initial.skyTop) },
      bottomColor: { value: new THREE.Color(initial.skyBottom) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        float t = pow(max(h * 0.5 + 0.5, 0.0), 0.85);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Ground
  const groundGeo = new THREE.CircleGeometry(25, 48);
  const groundMat = new THREE.MeshStandardMaterial({
    color: initial.groundColor,
    roughness: 0.92,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fog
  scene.fog = new THREE.FogExp2(initial.fogColor, initial.fogDensity);

  // Lights
  const hemi = new THREE.HemisphereLight(
    initial.hemiSky,
    initial.hemiGround,
    initial.hemiIntensity,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(initial.sunColor, initial.sunIntensity);
  sun.position.set(...initial.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);

  // Ambient fill
  const amb = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(amb);

  // Particles
  const maxParticles = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(maxParticles * 3);
  const pVel = new Float32Array(maxParticles * 3);
  const pSize = new Float32Array(maxParticles);

  for (let i = 0; i < maxParticles; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 18;
    pPos[i * 3 + 1] = Math.random() * 6 + 0.5;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    pVel[i * 3] = -0.8 - Math.random() * 1.2;
    pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    pSize[i] = 0.04 + Math.random() * 0.08;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));

  const pMat = new THREE.PointsMaterial({
    color: initial.particleColor,
    size: 0.12,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  let currentCount = initial.particleCount;
  let particleType = initial.particles;

  function setLocation(loc: LocationPreset) {
    (skyMat.uniforms.topColor.value as THREE.Color).set(loc.skyTop);
    (skyMat.uniforms.bottomColor.value as THREE.Color).set(loc.skyBottom);
    groundMat.color.set(loc.groundColor);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(loc.fogColor);
      scene.fog.density = loc.fogDensity;
    }
    hemi.color.set(loc.hemiSky);
    hemi.groundColor.set(loc.hemiGround);
    hemi.intensity = loc.hemiIntensity;
    sun.color.set(loc.sunColor);
    sun.intensity = loc.sunIntensity;
    sun.position.set(...loc.sunPosition);
    pMat.color.set(loc.particleColor);
    currentCount = loc.particleCount;
    particleType = loc.particles;
  }

  function update(_dt: number, time: number, wind01: number) {
    const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
    const speed = 1.2 + wind01 * 4.5;

    for (let i = 0; i < currentCount; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Type-specific motion
      if (particleType === 'snow') {
        x += (pVel[i * 3] * 0.4 + Math.sin(time * 1.5 + i) * 0.3) * speed * 0.016;
        y += pVel[i * 3 + 1] * 0.016 - 0.015;
        z += (pVel[i * 3 + 2] * 0.4 + Math.cos(time * 1.2 + i) * 0.25) * speed * 0.016;
      } else if (particleType === 'sparkles') {
        x += pVel[i * 3] * speed * 0.01;
        y += Math.sin(time * 3 + i) * 0.008;
        z += pVel[i * 3 + 2] * speed * 0.01;
      } else {
        x += pVel[i * 3] * speed * 0.016;
        y += pVel[i * 3 + 1] * 0.016 + Math.sin(time * 2 + i) * 0.002;
        z += pVel[i * 3 + 2] * speed * 0.016;
      }

      // Recycle
      if (x < -10 || y < 0.05 || y > 9 || Math.abs(z) > 12) {
        if (particleType === 'snow') {
          x = (Math.random() - 0.5) * 16;
          y = 5 + Math.random() * 4;
          z = (Math.random() - 0.5) * 16;
          pVel[i * 3 + 1] = -0.2 - Math.random() * 0.3;
        } else if (particleType === 'sparkles') {
          x = (Math.random() - 0.5) * 10;
          y = 0.5 + Math.random() * 3;
          z = (Math.random() - 0.5) * 8;
          pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
        } else {
          x = 8 + Math.random() * 4;
          y = 0.4 + Math.random() * 5;
          z = (Math.random() - 0.5) * 14;
          if (particleType === 'petals') {
            pVel[i * 3 + 1] = -0.15 - Math.random() * 0.25;
          } else if (particleType === 'sand') {
            pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
          } else {
            pVel[i * 3 + 1] = -0.1 - Math.random() * 0.2;
          }
        }
      }

      pos.setXYZ(i, x, y, z);
    }
    // Hide unused
    for (let i = currentCount; i < maxParticles; i++) {
      pos.setXYZ(i, 0, -10, 0);
    }
    pos.needsUpdate = true;
  }

  function dispose() {
    scene.remove(sky, ground, hemi, sun, amb, particles);
    skyGeo.dispose();
    skyMat.dispose();
    groundGeo.dispose();
    groundMat.dispose();
    pGeo.dispose();
    pMat.dispose();
  }

  return { setLocation, update, dispose };
}
