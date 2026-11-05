// Procedural props: chips, soil and clover. No assets beyond the chip texture.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A baked, slightly warped cracker: closed top and bottom surfaces, unit radius. */
export function chipGeometry(seed) {
  const r = rand(seed);
  const rings = 12;
  const segs = 44;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const sad = 0.16 + r() * 0.1;
  const dome = 0.07 + r() * 0.1;
  const uvOff = [r() * 0.3, r() * 0.3];
  const stretch = 0.84 + r() * 0.12;

  const surf = (t, a, side) => {
    const edge = 1 + 0.035 * Math.sin(3 * a + ph[0]) + 0.022 * Math.sin(5 * a + ph[1]) + 0.012 * Math.sin(11 * a + ph[2]);
    const rad = t * edge;
    const x = rad * Math.cos(a);
    const y = rad * Math.sin(a) * stretch;
    const curl = sad * (x * x - y * y) + dome * (1 - rad * rad) + 0.04 * Math.sin(x * 3.2 + ph[3]) * Math.cos(y * 2.6);
    const thick = 0.04 * Math.sqrt(Math.max(0, 1 - t * t * t));
    return [x, y, curl + side * thick];
  };

  const pos = [];
  const uv = [];
  const idx = [];
  const addSide = (side) => {
    const base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const p = surf(t, a, side);
        pos.push(p[0], p[1], p[2]);
        uv.push(0.25 + uvOff[0] + p[0] * 0.24, 0.25 + uvOff[1] + p[1] * 0.24);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * (segs + 1) + j;
        const b = a + segs + 1;
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  };
  addSide(1);
  addSide(-1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A mound of earth: textured surface plus real clods sitting on it. */
export function makeSoil(map, normalMap, clodCount) {
  [map, normalMap].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3.4, 3.4);
  });
  const raw = new THREE.IcosahedronGeometry(1, 22);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const geo = mergeVertices(raw, 1e-4);
  const p = geo.attributes.position;
  const r = rand(11);
  const lumps = Array.from({ length: 46 }, () => [
    new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
    0.008 + r() * 0.03,
    60 + r() * 220,
  ]);
  const n = new THREE.Vector3();
  const heightAt = (dir) => {
    let d = 0;
    for (const [c, amp, sharp] of lumps) d += amp * Math.exp(-(1 - dir.dot(c)) * sharp);
    return 1 + d;
  };
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize();
    const h = heightAt(n);
    p.setXYZ(i, n.x * h, n.y * h, n.z * h);
    // projected from above and slightly from the front: no stretching on the visible slope
    uv[i * 2] = n.x * 1.2;
    uv[i * 2 + 1] = (n.y - n.z) * 1.2;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.96, envMapIntensity: 0.55 });
  const mesh = new THREE.Mesh(geo, mat);

  // Clods: crumbly lumps of several sizes.
  const clodRaw = new THREE.IcosahedronGeometry(1, 1);
  clodRaw.deleteAttribute('normal');
  clodRaw.deleteAttribute('uv');
  const clodGeo = mergeVertices(clodRaw, 1e-4);
  const cp = clodGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const k = 0.72 + r() * 0.5;
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i) * k * 0.78, cp.getZ(i) * k);
  }
  const clodFlat = clodGeo.toNonIndexed();
  const fp = clodFlat.attributes.position;
  const cuv = new Float32Array(fp.count * 2);
  for (let i = 0; i < fp.count; i++) {
    cuv[i * 2] = fp.getX(i) * 0.1;
    cuv[i * 2 + 1] = fp.getZ(i) * 0.1 + fp.getY(i) * 0.06;
  }
  clodFlat.setAttribute('uv', new THREE.BufferAttribute(cuv, 2));
  clodFlat.computeVertexNormals();
  const clodMat = new THREE.MeshStandardMaterial({ map, roughness: 0.97, flatShading: true, envMapIntensity: 0.45 });
  const clods = new THREE.InstancedMesh(clodFlat, clodMat, clodCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < clodCount; i++) {
    // front-facing cap only: the back of the mound is never seen
    const theta = (r() - 0.5) * 1.5;
    const y = 0.42 + r() * 0.58;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    n.set(Math.sin(theta) * rad, y, Math.cos(theta) * rad).normalize();
    pos.copy(n).multiplyScalar(heightAt(n) + 0.002);
    const big = r() < 0.07;
    scl.setScalar(big ? 0.019 + r() * 0.014 : 0.004 + r() * r() * 0.012);
    e.set(r() * 6.28, r() * 6.28, r() * 6.28);
    m.compose(pos, q.setFromEuler(e), scl);
    clods.setMatrixAt(i, m);
    const shade = 1.0 + r() * 1.5;
    clods.setColorAt(i, col.setRGB(shade, shade * 0.94, shade * 0.86));
  }
  mesh.add(clods);
  return mesh;
}

function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, '#2f7a33');
  g.addColorStop(1, '#3f9440');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  // pale chevron: the signature marking of clover leaves
  x.strokeStyle = 'rgba(205,232,170,.42)';
  x.lineWidth = 20;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(44, 150);
  x.quadraticCurveTo(128, 96, 212, 150);
  x.stroke();
  x.strokeStyle = 'rgba(16,62,26,.5)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(128, 256);
  x.lineTo(128, 10);
  x.stroke();
  x.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const y = 220 - i * 23;
    x.beginPath();
    x.moveTo(128, y);
    x.lineTo(20, y - 48);
    x.moveTo(128, y);
    x.lineTo(236, y - 48);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Heart-shaped leaflet, grown from the stem tip along +Y. */
function leafletGeometry() {
  const us = 18;
  const vs = 10;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= us; i++) {
    const t = i / us;
    // obcordate width profile, notched at the tip
    const w = 0.56 * Math.sin(Math.pow(t, 1.25) * Math.PI) ** 0.62;
    for (let j = 0; j <= vs; j++) {
      const s = (j / vs) * 2 - 1;
      const notch = 0.2 * Math.exp(-((s * 2.6) ** 2)) * t ** 5;
      const y = t - notch;
      const x = s * w;
      const fold = Math.abs(s) * w * 0.3 + 0.1 * Math.sin(t * Math.PI);
      pos.push(x, y, fold);
      uv.push(s * 0.5 + 0.5, t);
    }
  }
  for (let i = 0; i < us; i++) {
    for (let j = 0; j < vs; j++) {
      const a = i * (vs + 1) + j;
      const b = a + vs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A clump of clover; set grow(0..1) to play it. */
export function makeClover() {
  const group = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), side: THREE.DoubleSide, roughness: 0.55, envMapIntensity: 0.9 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5c9a4a, roughness: 0.6 });
  const leafGeo = leafletGeometry();
  const r = rand(23);

  const sprigs = [
    { x: 0, z: 0.05, h: 1.0, lean: 0.03, delay: 0 },
    { x: -0.3, z: -0.05, h: 0.74, lean: -0.3, delay: 0.1 },
    { x: 0.33, z: -0.02, h: 0.82, lean: 0.34, delay: 0.06 },
    { x: -0.14, z: 0.14, h: 0.5, lean: -0.42, delay: 0.24 },
    { x: 0.19, z: 0.16, h: 0.46, lean: 0.5, delay: 0.3 },
    { x: 0.53, z: 0.06, h: 0.42, lean: 0.62, delay: 0.34 },
    { x: -0.5, z: 0.08, h: 0.38, lean: -0.62, delay: 0.38 },
  ].map((s) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(s.lean * 0.1, s.h * 0.4, 0.015),
      new THREE.Vector3(s.lean * 0.34, s.h * 0.78, 0.02),
      new THREE.Vector3(s.lean * 0.6, s.h, 0),
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.016, 6), stemMat);
    const holder = new THREE.Group();
    holder.position.set(s.x, 0, s.z);
    holder.add(stem);

    const crown = new THREE.Group();
    crown.position.copy(curve.getPoint(1));
    const leaves = [0, 1, 2].map((k) => {
      const m = new THREE.Mesh(leafGeo, leafMat);
      const piv = new THREE.Group();
      piv.rotation.y = (k / 3) * Math.PI * 2 + r() * 0.2;
      m.scale.setScalar(0.25 + s.h * 0.11);
      piv.add(m);
      crown.add(piv);
      return m;
    });
    crown.rotation.set(0.42 + r() * 0.3, r() * 2, s.lean * -0.35);
    holder.add(crown);
    group.add(holder);
    return { ...s, holder, crown, leaves };
  });

  const ease = (t) => 1 - (1 - t) ** 3;
  group.userData.grow = (g) => {
    group.visible = g > 0.001;
    for (const s of sprigs) {
      const t = Math.min(1, Math.max(0, (g - s.delay) / (1 - s.delay)));
      const e = ease(t);
      s.holder.scale.setScalar(Math.max(0.0001, e));
      const open = ease(Math.min(1, Math.max(0, (t - 0.28) / 0.72)));
      // leaflets start folded upward and spread open as they mature
      for (const m of s.leaves) m.rotation.x = 0.22 + open * 1.08;
      s.crown.scale.setScalar(Math.max(0.0001, 0.35 + 0.65 * open));
    }
  };
  group.userData.sway = (time) => {
    sprigs.forEach((s, i) => {
      s.holder.rotation.z = Math.sin(time * 0.9 + i * 1.7) * 0.022;
      s.holder.rotation.x = Math.cos(time * 0.7 + i) * 0.016;
    });
  };
  return group;
}

export function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(25,20,10,.62)');
  g.addColorStop(0.45, 'rgba(25,20,10,.28)');
  g.addColorStop(1, 'rgba(25,20,10,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
