import * as THREE from 'three';
import type { LocationPreset } from '../lib/types';

export interface EnvironmentHandle {
  setLocation(loc: LocationPreset): void;
  /** true = a real HDRI photo sky is used: hide procedural sky/scenery */
  setHdri(on: boolean): void;
  update(dt: number, time: number, wind01: number): void;
  dispose(): void;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6d6d6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 150 + Math.floor(Math.random() * 105);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    const w = 1 + Math.random() * 3;
    g.fillRect(Math.random() * 256, Math.random() * 256, w, w * (1 + Math.random() * 2));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PARTICLE_SIZE: Record<string, number> = {
  petals: 0.075,
  leaves: 0.07,
  sand: 0.035,
  dust: 0.03,
  snow: 0.06,
  sparkles: 0.05,
};

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
  const groundGeo = new THREE.CircleGeometry(60, 64);
  const groundTex = makeGroundTexture();
  const groundMat = new THREE.MeshStandardMaterial({
    color: initial.groundColor,
    map: groundTex,
    roughness: 0.95,
    metalness: 0,
  });
  const shadowOnlyMat = new THREE.ShadowMaterial({ opacity: 0.4 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Location scenery: lightweight procedural landmarks keep the experience self-contained.
  const scenery = new THREE.Group();
  scene.add(scenery);

  const makeMat = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx=1, sy=1, sz=1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow = true; m.receiveShadow = true; scenery.add(m); return m;
  };
  const leafCols = ['#3f7a45', '#4d8c4f', '#356b3d', '#5b9a55', '#2f6238'];
  const addTree = (x: number, z: number, scale = 1, pine = false) => {
    const j = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const r = Math.abs(j);
    const bark = makeMat(r > 0.5 ? '#5e4330' : '#6d4f38', 0.95);
    addMesh(new THREE.CylinderGeometry(0.07 * scale, 0.15 * scale, 1.4 * scale, 8), bark, x, 0.7 * scale, z);
    if (pine) {
      for (let i = 0; i < 4; i++) {
        addMesh(new THREE.ConeGeometry((0.78 - i * 0.14) * scale, 0.9 * scale, 9), makeMat(i % 2 ? '#2d5a40' : '#386b4a', 0.95), x, (1.2 + i * 0.5) * scale, z);
      }
    } else {
      const col = leafCols[Math.floor(r * leafCols.length) % leafCols.length];
      const blobs: Array<[number, number, number, number]> = [
        [0, 1.9, 0, 0.7], [0.4, 1.65, 0.15, 0.5], [-0.38, 1.7, -0.1, 0.52], [0.1, 2.3, -0.1, 0.46], [-0.1, 1.6, 0.4, 0.45],
      ];
      blobs.forEach(([bx, by, bz, br], i) => {
        const m = addMesh(new THREE.IcosahedronGeometry(br * scale, 1), makeMat(i % 2 ? col : leafCols[(i + 1) % leafCols.length], 0.95), x + bx * scale, by * scale, z + bz * scale);
        m.rotation.set(i, i * 2, 0);
      });
    }
  };
  const addPalm = (x:number,z:number,scale=1) => {
    const trunk = addMesh(new THREE.CylinderGeometry(0.07*scale,0.13*scale,2.8*scale,8),makeMat('#8a6744'),x,1.4*scale,z);
    trunk.rotation.z = -0.12;
    for(let i=0;i<7;i++){ const a=i*Math.PI*2/7; const leaf=addMesh(new THREE.ConeGeometry(0.16*scale,1.65*scale,5),makeMat('#3d8052'),x+Math.cos(a)*0.55*scale,2.75*scale,z+Math.sin(a)*0.55*scale,1,1,1); leaf.rotation.z=Math.cos(a)*0.85; leaf.rotation.x=Math.sin(a)*0.85; }
  };
  const addBuilding = (x:number,z:number,w:number,h:number,d:number,color:string) => {
    addMesh(new THREE.BoxGeometry(w,h,d),makeMat(color,0.72),x,h/2,z);
    const windowMat=makeMat('#9fc4d8',0.28);
    for(let yy=0.8; yy<h-0.3; yy+=0.8) for(let xx=-w/2+0.35; xx<w/2-0.2; xx+=0.65) addMesh(new THREE.BoxGeometry(0.28,0.36,0.025),windowMat,x+xx,yy,z-d/2-0.02);
  };
  const addRock = (x:number,z:number,s=1) => addMesh(new THREE.DodecahedronGeometry(0.45*s,0),makeMat('#77776e'),x,0.2*s,z,1.4,0.7,1.1);

  // Always add a soft horizon; then build scenery according to the selected place.
  const buildScenery = (loc: LocationPreset) => {
    while (scenery.children.length) {
      const child = scenery.children[0];
      scenery.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    if(['garden','park','meadow'].includes(loc.id)) {
      for(let i=0;i<12;i++){ const x=(i%6-2.5)*2.8; const z=-3-Math.floor(i/6)*4; addTree(x,z,0.7+(i%3)*0.12); }
      const flowerMat=makeMat('#e8a9c0');
      for(let i=0;i<28;i++){ const x=(Math.random()-0.5)*15,z=(Math.random()-0.5)*12; addMesh(new THREE.SphereGeometry(0.07,6,5),flowerMat,x,0.08,z,1,1.3,1); }
    } else if(loc.id==='forest' || loc.id==='snow') {
      for(let i=0;i<22;i++) addTree((i%7-3)*2.8,-3-Math.floor(i/7)*3.3,0.85+(i%4)*0.12,true);
    } else if(loc.id==='beach') {
      addMesh(new THREE.PlaneGeometry(42,22),makeMat('#3c9db7',0.3),0,0.025,-15).rotation.x=-Math.PI/2;
      for(let i=0;i<7;i++) addPalm(-9+i*3, -5-(i%2)*2,0.8+(i%3)*0.12);
      for(let i=0;i<8;i++) addRock(-10+i*2.8,-1-(i%3)*2,0.7);
    } else if(loc.id==='lake') {
      addMesh(new THREE.CircleGeometry(9,40),makeMat('#438fa6',0.25),0,0.035,-9,1,1,0.72).rotation.x=-Math.PI/2;
      for(let i=0;i<10;i++) addTree(-10+i*2.2,-4-(i%3)*2,0.65);
    } else if(loc.id==='desert') {
      for(let i=0;i<8;i++) addMesh(new THREE.SphereGeometry(1,12,8),makeMat(i%2?'#c59a5c':'#d7b477'),-12+i*3,0.0,-9,3.2,0.7,1.8);
      for(let i=0;i<5;i++) addMesh(new THREE.CylinderGeometry(0.35,0.5,1.4,7),makeMat('#4c7650'),-8+i*4,0.7,-3,1,1,1);
    } else if(['rooftop','night_city','courtyard'].includes(loc.id)) {
      addBuilding(-8,-9,3,5,3,loc.id==='night_city'?'#26344b':'#747b83');
      addBuilding(-3,-11,3.4,7,3,'#596775');
      addBuilding(3,-10,4,4.5,3,'#858b90');
      addBuilding(8,-8,3.2,6,3,'#4b5c6a');
      if(loc.id==='courtyard'){ for(let i=0;i<4;i++) addTree(-7+i*4,-2,0.65); }
    }
  };
  buildScenery(initial);

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
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  scene.add(sun);

  // Ambient fill
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(amb);

  // Particles
  const maxParticles = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(maxParticles * 3);
  const pVel = new Float32Array(maxParticles * 3);

  for (let i = 0; i < maxParticles; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 18;
    pPos[i * 3 + 1] = Math.random() * 6 + 0.5;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    pVel[i * 3] = -0.8 - Math.random() * 1.2;
    pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));

  const pMat = new THREE.PointsMaterial({
    color: initial.particleColor,
    map: makeSpriteTexture(),
    size: PARTICLE_SIZE[initial.particles] ?? 0.06,
    transparent: true,
    alphaTest: 0.02,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  let currentCount = initial.particleCount;
  let particleType = initial.particles;
  let currentLoc = initial;
  let hdriOn = false;

  function applyHdriLighting() {
    hemi.intensity = currentLoc.hemiIntensity * 0.3;
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = currentLoc.fogDensity * 0.25;
  }

  function setHdri(on: boolean) {
    hdriOn = on;
    sky.visible = !on;
    scenery.visible = !on;
    (ground as THREE.Mesh).material = on ? shadowOnlyMat : groundMat;
    if (on) {
      applyHdriLighting();
    } else {
      hemi.intensity = currentLoc.hemiIntensity;
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = currentLoc.fogDensity;
    }
  }

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
    buildScenery(loc);
    pMat.color.set(loc.particleColor);
    currentCount = loc.particleCount;
    particleType = loc.particles;
    pMat.size = PARTICLE_SIZE[loc.particles] ?? 0.06;
    currentLoc = loc;
    if (hdriOn) applyHdriLighting();
  }

  function update(_dt: number, time: number, wind01: number) {
    const pos = pGeo.getAttribute('position') as THREE.BufferAttribute;
    const blowing = wind01 > 0.03;
    const speed = particleType === 'snow' ? 0.8 + wind01 * 4 : wind01 * 5;
    particles.visible = blowing || particleType === 'snow';
    pMat.opacity = particleType === 'snow' ? 0.85 : 0.85 * Math.min(1, wind01 * 3);
    if (!particles.visible) return;

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
    scene.remove(sky, ground, hemi, sun, amb, particles, scenery);
    skyGeo.dispose();
    skyMat.dispose();
    groundGeo.dispose();
    groundMat.dispose();
    shadowOnlyMat.dispose();
    groundTex.dispose();
    pGeo.dispose();
    pMat.map?.dispose();
    pMat.dispose();
  }

  return { setLocation, setHdri, update, dispose };
}
