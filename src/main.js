import '@fontsource-variable/onest/wght.css';
import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { blobTexture, chipGeometry, makeClover, makeSoil } from './props.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('stage');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (t * (6 * t - 15) + 10);

/* ------------------------------------------------------------------ scroll map */
const sections = [...document.querySelectorAll('.scene')];
const secMap = {};
let vh = innerHeight;
let vw = innerWidth;

function measure() {
  vh = innerHeight;
  vw = innerWidth;
  for (const el of sections) {
    const top = el.getBoundingClientRect().top + scrollY;
    secMap[el.id] = { top, len: Math.max(1, el.offsetHeight - vh), el };
  }
}
/** Page scroll position for "scene:progress". */
const at = (name, p) => secMap[name].top + secMap[name].len * p;

/** Keyframed value over page scroll: [[scene, p, value, ease?], ...]. */
function track(keys) {
  return (s) => {
    const k0 = keys[0];
    if (s <= at(k0[0], k0[1])) return k0[2];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      const sa = at(a[0], a[1]);
      const sb = at(b[0], b[1]);
      if (s <= sb) {
        if (sb <= sa) return b[2];
        return lerp(a[2], b[2], (b[3] || smooth)((s - sa) / (sb - sa)));
      }
    }
    return keys[keys.length - 1][2];
  };
}

/* ------------------------------------------------------------------ text beats */
const beats = [...document.querySelectorAll('[data-t]')].map((el) => {
  const [a, b, c, d] = el.dataset.t.split(',').map(Number);
  return { el, a, b, c, d, sec: el.closest('.scene').id, shown: null };
});

function updateBeats(s) {
  for (const B of beats) {
    const m = secMap[B.sec];
    const p = (s - m.top) / m.len;
    let o = 1;
    let y = 0;
    if (B.a >= 0 && p < B.b) {
      const t = clamp((p - B.a) / (B.b - B.a));
      o = t;
      y = (1 - smooth(t)) * 34;
    } else if (p > B.c) {
      const t = clamp((p - B.c) / (B.d - B.c));
      o = 1 - t;
      y = -smooth(t) * 30;
    }
    o = smooth(o);
    const vis = o > 0.002;
    if (vis !== B.shown) {
      B.el.style.visibility = vis ? 'visible' : 'hidden';
      B.shown = vis;
    }
    if (vis) {
      B.el.style.opacity = o.toFixed(3);
      // the scrim comes first, the text only once there is something to read it on
      B.el.style.setProperty('--text', smooth(clamp((o - 0.45) / 0.55)).toFixed(3));
      B.el.style.transform = y ? `translate3d(0,${y.toFixed(1)}px,0)` : '';
    }
  }
}

/* ------------------------------------------------------------------ colours */
const BG = {
  cream: [244, 239, 228],
  warm: [243, 226, 196],
  dark: [13, 32, 22],
  sage: [221, 229, 205],
  sky: [214, 226, 196],
};
const bgKeys = [
  ['hero', 0.3, 'cream'],
  ['baked', 0.0, 'cream'],
  ['baked', 0.5, 'warm'],
  ['baked', 1, 'warm'],
  ['fresh', 0.0, 'dark'],
  ['fresh', 1, 'dark'],
  ['paper', 0.0, 'cream'],
  ['paper', 1, 'cream'],
  ['plant', 0.42, 'cream'],
  ['plant', 0.6, 'sky'],
  ['plant', 1, 'sky'],
  ['formats', 0.0, 'cream'],
  ['formats', 1, 'cream'],
  ['final', 0.0, 'dark'],
];
const bgTracks = [0, 1, 2].map((c) => track(bgKeys.map((k) => [k[0], k[1], BG[k[2]][c]])));
const metaTheme = document.querySelector('meta[name=theme-color]');
const bar = document.getElementById('bar');
let lastBg = '';
function updateBg(s) {
  const r = bgTracks[0](s) | 0;
  const g = bgTracks[1](s) | 0;
  const b = bgTracks[2](s) | 0;
  const css = `rgb(${r},${g},${b})`;
  if (css !== lastBg) {
    document.documentElement.style.setProperty('--bg', css);
    metaTheme.content = css;
    bar.classList.toggle('on-dark', 0.3 * r + 0.59 * g + 0.11 * b < 110);
    lastBg = css;
  }
}

/* ------------------------------------------------------------------ renderer */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  console.warn('WebGL is unavailable, showing the poster', err);
}

measure();
updateBeats(scrollY);
updateBg(scrollY);
addEventListener('scroll', () => { if (!renderer) { updateBeats(scrollY); updateBg(scrollY); } }, { passive: true });
addEventListener('resize', () => { if (!renderer) { measure(); } });

if (renderer) start(renderer);

async function start(renderer) {
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  const scene = new THREE.Scene();
  const FOV = 28;
  const CAM_D = 7;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, CAM_D);
  const VIEW_H = 2 * CAM_D * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  let VIEW_W = VIEW_H;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;
  const key = new THREE.DirectionalLight(0xfff3e2, 1.75);
  key.position.set(-3.2, 4.2, 6);
  const rim = new THREE.DirectionalLight(0xfff8ee, 1.05);
  rim.position.set(3.5, 2.5, -4);
  const fill = new THREE.DirectionalLight(0xeaf1ff, 0.38);
  fill.position.set(4, -1, 4);
  scene.add(key, rim, fill);

  /* ---------- assets ---------- */
  const texLoader = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (url, color = true) =>
    new Promise((res, rej) =>
      texLoader.load(url, (t) => {
        t.flipY = false;
        t.anisotropy = maxAniso;
        if (color) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, rej));

  const [gltf, tFront, tBack, nFront, nBack, tKraft, tTag, tChip, nChip, tSoil, nSoil] = await Promise.all([
    new GLTFLoader().loadAsync('/assets/pack.glb'),
    tex('/assets/front.webp'),
    tex('/assets/back.webp'),
    tex('/assets/front_n.webp', false),
    tex('/assets/back_n.webp', false),
    tex('/assets/kraft.webp'),
    tex('/assets/tag.webp'),
    tex('/assets/chip.webp'),
    tex('/assets/chip_n.webp', false),
    tex('/assets/soil.webp'),
    tex('/assets/soil_n.webp', false),
    document.fonts.load('800 80px "Onest Variable"', '75 г'),
  ]);

  const paper = (map, normalMap) =>
    new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.74, metalness: 0, envMapIntensity: 1 });
  const matFront = paper(tFront, nFront);
  const matBack = paper(tBack, nBack);
  const matGusset = paper(tKraft, null);
  const matTag = new THREE.MeshStandardMaterial({ map: tTag, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.88 });
  const matInd = new THREE.MeshPhysicalMaterial({ color: 0xf3f3f0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x000000 });

  function weightMaterial(label) {
    const c = document.createElement('canvas');
    c.width = 288;
    c.height = 228;
    const x = c.getContext('2d');
    x.fillStyle = '#1f4a25';
    x.font = '800 118px "Onest Variable", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.letterSpacing = '-5px';
    x.fillText(label, 144, 118);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  // Pivot at the visual centre of the pack.
  const source = gltf.scene;
  const parts = {};
  source.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name;
    parts[n] = o;
    if (n.startsWith('Pack_Front')) o.material = matFront;
    else if (n.startsWith('Pack_Back')) o.material = matBack;
    else if (n.startsWith('Pack_Gusset')) o.material = matGusset;
    else if (n.startsWith('Tag_')) o.material = matTag;
    else if (n.startsWith('Indicator')) o.material = matInd;
  });
  const findPart = (prefix) => Object.values(parts).find((o) => o.name.startsWith(prefix));
  const buildPack = (label) => {
    const inner = source.clone(true);
    inner.position.y = -1.1;
    const wrap = new THREE.Group();
    wrap.add(inner);
    inner.traverse((o) => { if (o.isMesh && o.name.startsWith('Pack_Weight')) o.material = weightMaterial(label); });
    return wrap;
  };

  const pack50 = buildPack('50 г');
  const pack30 = buildPack('30 г');
  const pack = buildPack('75 г');
  scene.add(pack, pack50, pack30);

  // Local points the camera moves in on.
  pack.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let packInd = null;
  let packTag = null;
  pack.traverse((o) => {
    if (o.isMesh && o.name.startsWith('Indicator')) packInd = o;
    if (o.isMesh && o.name.startsWith('Tag_')) packTag = o;
  });
  const indLocal = packInd.getWorldPosition(new THREE.Vector3());
  box.setFromObject(packTag);
  const tagLocal = box.getCenter(new THREE.Vector3());
  const tagW = box.max.x - box.min.x;
  const tagH = box.max.y - box.min.y;

  // The main pack's tag becomes free-standing, so it can peel off and fly.
  const tagGeo = packTag.geometry.clone();
  tagGeo.applyMatrix4(packTag.matrixWorld);
  tagGeo.translate(-tagLocal.x, -tagLocal.y, -tagLocal.z);
  const tagRest = Float32Array.from(tagGeo.attributes.position.array);
  packTag.visible = false;
  const tag = new THREE.Mesh(tagGeo, matTag);
  tag.matrixAutoUpdate = true;
  scene.add(tag);

  /* ---------- chips ---------- */
  const chipMat = new THREE.MeshStandardMaterial({ map: tChip, normalMap: nChip, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.78, envMapIntensity: 0.9 });
  [tChip, nChip].forEach((t) => { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; });
  const chipGeos = [3, 8, 14, 21].map(chipGeometry);
  const isNarrow = () => VIEW_W / VIEW_H < 1;
  // tx,ty: resting point in view fractions; r: size in view-height fractions; z: depth.
  const chipPlan = [
    { tx: 0.12, ty: 0.42, r: 0.05, z: -0.9, hero: true },
    { tx: -0.34, ty: 0.34, r: 0.05, z: -0.6 },
    { tx: 0.36, ty: 0.3, r: 0.065, z: -0.4 },
    { tx: -0.42, ty: 0.06, r: 0.058, z: 0.1 },
    { tx: 0.44, ty: 0.02, r: 0.05, z: -0.8 },
    { tx: -0.4, ty: -0.13, r: 0.042, z: -0.5 },
    { tx: 0.42, ty: -0.14, r: 0.06, z: 0.3 },
    { tx: -0.14, ty: 0.44, r: 0.04, z: -1 },
    { tx: 0.16, ty: 0.46, r: 0.046, z: -0.9 },
    { tx: 0.02, ty: -0.19, r: 0.03, z: -1.2 },
  ];
  const r0 = (i, k) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const chips = chipPlan.map((c, i) => {
    const m = new THREE.Mesh(chipGeos[i % chipGeos.length], chipMat);
    m.visible = false;
    scene.add(m);
    return { ...c, m, phase: i * 1.37, spin: [r0(i, 1) * 0.9, r0(i, 2) * 1.2, r0(i, 3) * 0.7] };
  });

  /* ---------- soil, clover, shadow ---------- */
  const soil = makeSoil(tSoil, nSoil, innerWidth < 760 ? 420 : 900);
  const clover = makeClover();
  scene.add(soil, clover);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  /* ---------- choreography ---------- */
  const TAU = Math.PI * 2;
  let stops = [];
  let packTracks = {};
  const v3 = new THREE.Vector3();
  const qu = new THREE.Quaternion();
  const eul = new THREE.Euler();

  function buildStops() {
    const n = isNarrow();
    // x,y: where the pivot/focus lands in view fractions (y up). h: pack height / view height.
    const M = (narrow, wide) => (n ? narrow : wide);
    const off = M(1.05, 1.1);
    stops = [
      ['hero', 0, { ...M({ x: 0, y: -0.075, h: 0.53 }, { x: 0.23, y: -0.03, h: 0.84 }), ry: -0.42, rx: 0.03, sh: 1 }],
      ['hero', 1, { ...M({ x: 0, y: -0.075, h: 0.53 }, { x: 0.23, y: -0.03, h: 0.84 }), ry: 0.2, rx: 0.03, sh: 1 }],
      ['baked', 0.08, { ...M({ x: 0, y: 0.13, h: 0.5 }, { x: 0.24, y: 0, h: 0.8 }), ry: 0.5, rx: 0.08, rz: -0.03, sh: 0 }],
      ['baked', 0.36, { ...M({ x: 0, y: 0.15, h: 0.46 }, { x: 0.24, y: 0, h: 0.72 }), ry: 0.9, rx: 0.12, rz: -0.06, sh: 0 }],
      ['baked', 0.54, { ...M({ x: 0, y: off, h: 0.46 }, { x: 0.24, y: off, h: 0.7 }), ry: 1.6, rx: 0.22, rz: -0.14, sh: 0 }],
      ['baked', 1, { ...M({ x: 0, y: off, h: 0.46 }, { x: 0.24, y: off, h: 0.7 }), ry: 1.6, rx: 0.22, rz: -0.14, sh: 0 }],
      // jump cut while off-screen
      ['baked', 1, { ...M({ x: 0, y: -1.15, h: 1.6 }, { x: 0.25, y: -1.2, h: 1.7 }), ry: -0.32, rx: 0.14, sh: 0, f: indLocal }],
      ['fresh', 0.12, { ...M({ x: 0, y: 0.16, h: 2.05 }, { x: 0.26, y: 0.02, h: 2.3 }), ry: -0.2, rx: 0.02, sh: 0, f: indLocal }],
      ['fresh', 1, { ...M({ x: 0, y: 0.16, h: 2.15 }, { x: 0.26, y: 0.02, h: 2.4 }), ry: -0.1, rx: 0.02, sh: 0, f: indLocal }],
      ['paper', 0.04, { ...M({ x: 0, y: 0.11, h: 0.56 }, { x: -0.22, y: -0.02, h: 0.82 }), ry: 0.4, rx: 0.03, sh: 0.7 }],
      ['paper', 0.46, { ...M({ x: 0, y: 0.11, h: 0.56 }, { x: -0.22, y: -0.02, h: 0.82 }), ry: Math.PI + 0.05, rx: 0.03, sh: 0.7 }],
      ['paper', 0.68, { ...M({ x: 0, y: 0.11, h: 0.56 }, { x: -0.22, y: -0.02, h: 0.82 }), ry: Math.PI + 0.35, rx: 0.03, sh: 0.7 }],
      ['paper', 1, { ...M({ x: 0, y: 0.11, h: 0.56 }, { x: -0.22, y: -0.02, h: 0.82 }), ry: TAU - 0.2, rx: 0.03, sh: 0.7 }],
      ['plant', 0.02, { ...M({ x: 0, y: 0.11, h: 0.56 }, { x: 0.2, y: -0.02, h: 0.84 }), ry: TAU, rx: 0.02, sh: 0.7 }],
      ['plant', 0.2, { ...M({ x: 0, y: 0.17, h: 1.32 }, { x: 0.25, y: 0, h: 1.8 }), ry: TAU - 0.08, rx: -0.02, sh: 0, f: tagLocal }],
      ['plant', 0.42, { ...M({ x: 0, y: 0.17, h: 1.32 }, { x: 0.25, y: 0, h: 1.8 }), ry: TAU + 0.02, rx: -0.02, sh: 0, f: tagLocal }],
      ['plant', 0.58, { ...M({ x: 0, y: 1.5, h: 1.1 }, { x: 0.25, y: 1.5, h: 1.5 }), ry: TAU + 0.4, rx: -0.2, sh: 0, f: tagLocal }],
      ['plant', 1, { ...M({ x: 0, y: 1.5, h: 1.1 }, { x: 0.25, y: 1.5, h: 1.5 }), ry: TAU + 0.4, rx: -0.2, sh: 0, f: tagLocal }],
      // jump cut, again off-screen
      ['plant', 1, { ...M({ x: 0, y: -1.1, h: 0.3 }, { x: 0.12, y: -1.1, h: 0.56 }), ry: TAU - 0.4, rx: 0.02, sh: 0 }],
    ];

    // Three packs in a row, sized to fit any phone's width: bottoms aligned.
    const aspect = VIEW_W / VIEW_H;
    const ratio = 1.48 / 2.2;
    const bigH = n ? Math.min(0.3, (0.92 * aspect) / (ratio * 2.42)) : Math.min(0.64, (0.5 * aspect) / (ratio * 2.42));
    const midH = bigH * 0.82;
    const smlH = bigH * 0.64;
    const cx = n ? 0 : 0.23;
    const span = n ? 0.92 : 0.5;
    const groundY = n ? 0.33 - 0.5 * 0.6 : -bigH / 2;
    const unit = (span * aspect) / (bigH + midH + smlH);
    const bigX = cx - span / 2 + (bigH * unit) / (2 * aspect);
    const midX = bigX + (((bigH + midH) / 2) * unit) / aspect;
    const smlX = midX + (((midH + smlH) / 2) * unit) / aspect;
    packTracks.big = { x: bigX, y: groundY + bigH / 2, h: bigH };
    packTracks.mid = { x: midX, y: groundY + midH / 2, h: midH };
    packTracks.sml = { x: smlX, y: groundY + smlH / 2, h: smlH };
    const bg = packTracks.big;
    stops.push(
      ['formats', 0.14, { x: bg.x, y: bg.y, h: bg.h, ry: 0.26, rx: 0.02, sh: 0.8 }],
      ['formats', 1, { x: bg.x, y: bg.y, h: bg.h, ry: 0.16, rx: 0.02, sh: 0.8 }],
      ['final', 0.0, { ...M({ x: 0, y: 0.15, h: 0.46 }, { x: 0.24, y: -0.02, h: 0.8 }), ry: -0.3, rx: 0.02, sh: 0 }],
      ['final', 1, { ...M({ x: 0, y: 0.15, h: 0.46 }, { x: 0.24, y: -0.02, h: 0.8 }), ry: 0.25, rx: 0.02, sh: 0 }],
    );

    // Resolve "focus" stops: place the pack so that the local point lands on (x,y).
    for (const [, , st] of stops) {
      const s = (st.h * VIEW_H) / 2.2;
      st.s = s;
      st.px = st.x * VIEW_W;
      st.py = st.y * VIEW_H;
      st.pz = 0;
      if (st.f) {
        eul.set(st.rx || 0, st.ry || 0, st.rz || 0);
        v3.copy(st.f).multiplyScalar(s).applyEuler(eul);
        st.px -= v3.x;
        st.py -= v3.y;
        st.pz = 0.15 - v3.z;
      }
    }
  }

  const SIGNALS = {
    red: track([['fresh', 0.5, 0], ['fresh', 0.62, 1], ['fresh', 0.92, 1], ['paper', 0, 0]]),
    chips: track([['baked', 0, 0], ['baked', 0.42, 1], ['baked', 0.92, 1], ['fresh', 0, 0]]),
    heroChip: track([['baked', 0.38, 0], ['baked', 0.62, 1], ['baked', 0.9, 1], ['fresh', 0, 1.4]]),
    peel: track([['plant', 0.22, 0], ['plant', 0.42, 1]]),
    fly: track([['plant', 0.42, 0], ['plant', 0.56, 1]]),
    sink: track([['plant', 0.56, 0], ['plant', 0.72, 1]]),
    soil: track([['plant', 0.42, 0], ['plant', 0.58, 1], ['plant', 1, 1], ['formats', 0, 0]]),
    grow: track([['plant', 0.7, 0], ['plant', 0.97, 1, (t) => t], ['plant', 1, 1], ['formats', 0, 0, () => 1]]),
    row: track([['formats', 0.02, 0], ['formats', 0.2, 1], ['formats', 1, 1], ['final', 0.0, 0]]),
  };

  function samplePose(s, out) {
    let i = 0;
    const list = stops;
    if (s <= at(list[0][0], list[0][1])) i = 0;
    else {
      i = list.length - 2;
      for (let k = 0; k < list.length - 1; k++) {
        if (s < at(list[k + 1][0], list[k + 1][1])) { i = k; break; }
      }
    }
    const A = list[i];
    const B = list[Math.min(i + 1, list.length - 1)];
    const sa = at(A[0], A[1]);
    const sb = at(B[0], B[1]);
    const t = sb > sa ? smoother(clamp((s - sa) / (sb - sa))) : 1;
    const a = A[2];
    const b = B[2];
    for (const k of ['px', 'py', 'pz', 's']) out[k] = lerp(a[k], b[k], t);
    for (const k of ['ry', 'rx', 'rz', 'sh']) out[k] = lerp(a[k] || 0, b[k] || 0, t);
    return out;
  }

  /* ---------- layout ---------- */
  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    VIEW_W = VIEW_H * camera.aspect;
    measure();
    buildStops();
  }
  layout();
  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    // Mobile URL bars fire small height changes: ignore those so nothing jumps.
    if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 140) {
      lastW = innerWidth;
      lastH = innerHeight;
      layout();
    }
  });

  /* ---------- tag peel: a curl that travels across the tag from its lower corner ---------- */
  function setPeel(p) {
    const pos = tagGeo.attributes.position;
    const dx = -0.66;
    const dy = 0.75;
    const reach = (Math.abs(dx) * tagW + Math.abs(dy) * tagH) * 1.05;
    const L = p * reach;
    const cx = tagW / 2;
    const cy = -tagH / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = tagRest[i * 3];
      const y = tagRest[i * 3 + 1];
      const z = tagRest[i * 3 + 2];
      const d = (x - cx) * dx + (y - cy) * dy;
      const k = Math.max(0, L - d);
      // the lifted part curls up and back over the tag
      pos.setXYZ(i, x + dx * 0.34 * k * k, y + dy * 0.34 * k * k, z + 0.72 * k ** 1.35 + (p > 0 ? 0.004 : 0));
    }
    pos.needsUpdate = true;
    tagGeo.computeVertexNormals();
  }

  /* ---------- frame ---------- */
  const pose = {};
  let smoothScroll = scrollY;
  let lastPeel = -1;
  let mx = 0;
  let my = 0;
  let tmx = 0;
  let tmy = 0;
  if (matchMedia('(hover: hover)').matches && !reduceMotion) {
    addEventListener('pointermove', (e) => {
      tmx = (e.clientX / innerWidth - 0.5) * 2;
      tmy = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  let last = performance.now();
  let intro = reduceMotion ? 1 : 0;
  const freePos = new THREE.Vector3();
  const freeQuat = new THREE.Quaternion();
  const attachQuat = new THREE.Quaternion();
  const attachPos = new THREE.Vector3();
  const colWhite = new THREE.Color(0xf3f3f0);
  const colRed = new THREE.Color(0xd21f2e);
  const emRed = new THREE.Color(0x5e0a10);

  function frame(now) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.05, elapsed);
    last = now;
    const time = now / 1000;
    if (document.hidden) { requestAnimationFrame(frame); return; }

    smoothScroll += (scrollY - smoothScroll) * (1 - Math.exp(-Math.min(elapsed, 0.3) * 10));
    if (Math.abs(scrollY - smoothScroll) < 0.1) smoothScroll = scrollY;
    const s = smoothScroll;
    updateBeats(s);
    updateBg(s);

    /* pack */
    samplePose(s, pose);
    intro = Math.min(1, intro + dt / 1.7);
    const ie = 1 - (1 - intro) ** 4;
    mx += (tmx - mx) * (1 - Math.exp(-dt * 4));
    my += (tmy - my) * (1 - Math.exp(-dt * 4));
    const sway = reduceMotion ? 0 : 1;
    const macro = clamp((pose.s - 1.6) / 1);
    const idleK = lerp(1, 0.25, macro) * sway;
    pack.position.set(pose.px, pose.py + (1 - ie) * -0.5 + Math.sin(time * 0.8) * 0.018 * idleK, pose.pz);
    pack.scale.setScalar(pose.s * lerp(0.86, 1, ie));
    pack.rotation.set(
      pose.rx + Math.sin(time * 0.53) * 0.012 * idleK + my * 0.035 * idleK,
      pose.ry + (1 - ie) * -1.1 + Math.sin(time * 0.41) * 0.04 * idleK + mx * 0.1 * idleK,
      pose.rz + Math.sin(time * 0.67) * 0.006 * idleK,
    );
    pack.visible = pose.py < VIEW_H * 1.4 && pose.py > -VIEW_H * 1.4;
    pack.updateMatrixWorld(true);

    shadow.visible = pose.sh > 0.01;
    if (shadow.visible) {
      const sw = 2.1 * pose.s;
      shadow.scale.set(sw, 0.85 * sw, 1);
      shadow.position.set(pose.px, pose.py - 1.1 * pose.s - 0.015, pose.pz);
      shadow.material.opacity = pose.sh * ie * (bgLum() > 110 ? 0.62 : 0.2);
    }

    /* indicator */
    const red = SIGNALS.red(s);
    matInd.color.copy(colWhite).lerp(colRed, red);
    matInd.emissive.copy(emRed).multiplyScalar(red);

    /* chips */
    const chipT = SIGNALS.chips(s);
    const heroT = SIGNALS.heroChip(s);
    const nar = isNarrow();
    chips.forEach((c, i) => {
      const vis = chipT > 0.002;
      c.m.visible = vis;
      if (!vis) return;
      const stag = clamp((chipT - i * 0.035) / 0.7);
      const e = 1 - (1 - stag) ** 3;
      // emerge from the top of the pack
      const ox = pose.px;
      const oy = pose.py + 0.5 * pose.s;
      let tx = c.tx * VIEW_W;
      let ty = c.ty * VIEW_H;
      let tz = c.z;
      let rad = c.r * VIEW_H * (nar ? 0.92 : 0.86);
      if (!nar) { tx = (c.tx * 0.92 + 0.24) * VIEW_W; ty = (c.ty - 0.1) * VIEW_H; }
      const drift = sway * Math.sin(time * 0.6 + c.phase) * 0.03;
      let x = lerp(ox, tx, e);
      let y = lerp(oy, ty, e) + drift;
      let z = lerp(-0.4, tz, e);
      let sc = rad * lerp(0.35, 1, e);
      let rx = c.spin[0] * 5 * (1 - e) + 0.5 + c.phase;
      let ry = c.spin[1] * 5 * (1 - e) + time * 0.1 * sway + c.phase;
      let rz = c.spin[2] * 4 * (1 - e) + c.phase * 0.5;
      if (c.hero) {
        // the first chip takes the screen while the pack leaves
        const h = smoother(clamp(heroT));
        const gx = nar ? 0 : 0.24 * VIEW_W;
        const gy = nar ? 0.17 * VIEW_H : 0.02 * VIEW_H;
        const gr = nar ? Math.min(0.66 * VIEW_W, 0.27 * VIEW_H) : 0.38 * VIEW_H;
        x = lerp(x, gx, h);
        y = lerp(y, gy, h);
        z = lerp(z, 0.8, h);
        sc = lerp(sc, gr, h);
        rx = lerp(rx, -0.42 + Math.sin(time * 0.35) * 0.08 * sway, h);
        ry = lerp(ry, 0.34 + Math.sin(time * 0.27) * 0.1 * sway, h);
        rz = lerp(rz, time * 0.06 * sway + 0.3, h);
        // exits downward with the transition out
        const exit = clamp(heroT - 1);
        y -= exit * exit * VIEW_H * 3.5;
      } else {
        const push = smooth(clamp(heroT));
        x = lerp(x, x * 1.18, push);
        const exit = clamp(heroT - 1);
        y += exit * VIEW_H * 2.6 * (i % 2 ? 1 : 0.8);
      }
      c.m.position.set(x, y, z);
      c.m.rotation.set(rx, ry, rz);
      c.m.scale.setScalar(sc);
    });

    /* soil + clover */
    const soilT = SIGNALS.soil(s);
    soil.visible = soilT > 0.002;
    const groundTop = (nar ? -0.08 : -0.26) * VIEW_H; // top of the mound, in world units
    const soilCx = nar ? 0 : 0.25 * VIEW_W;
    if (soil.visible) {
      const sw = nar ? Math.max(VIEW_W * 1.25, VIEW_H * 0.72) : VIEW_H * 1.5;
      soil.scale.set(sw, sw * 0.62, sw * 0.5);
      const top = soil.scale.y * 0.97;
      soil.position.set(soilCx, lerp(-VIEW_H / 2 - top - 0.2, groundTop - top, smoother(soilT)), -0.2);
    }
    const g = SIGNALS.grow(s);
    clover.userData.grow(g);
    if (clover.visible) {
      const cs = (nar ? 0.3 : 0.42) * VIEW_H;
      clover.scale.setScalar(cs);
      clover.position.set(soilCx, groundTop - 0.06 + (soil.position.y - (groundTop - soil.scale.y * 0.97)), 0.15);
      clover.userData.sway(sway * time);
    }

    /* tag */
    const peel = SIGNALS.peel(s);
    if (Math.abs(peel - lastPeel) > 0.0005) {
      setPeel(smooth(peel));
      lastPeel = peel;
    }
    const fly = smoother(SIGNALS.fly(s));
    const sink = SIGNALS.sink(s);
    const finished = s >= at('plant', 0.99);
    tag.visible = !(sink >= 1 && !finished) && pack.visible | (fly > 0);

    v3.copy(tagLocal);
    attachPos.copy(v3).applyMatrix4(pack.matrixWorld);
    pack.getWorldQuaternion(attachQuat);
    const attachS = pack.scale.x;
    if (fly <= 0 || finished) {
      tag.position.copy(attachPos);
      tag.quaternion.copy(attachQuat);
      tag.scale.setScalar(attachS);
    } else {
      const land = groundTop + 0.03 * VIEW_H;
      const wig = Math.sin(fly * Math.PI) * 0.55;
      const sinkE = smooth(sink);
      const targetS = (nar ? 0.2 : 0.17) * VIEW_H / tagW * 1.4;
      // flutter down onto the mound, then lie flat and sink in
      freePos.set(
        lerp(attachPos.x, soilCx, fly) + wig * 0.4 * Math.sin(fly * 9),
        lerp(attachPos.y, land + (1 - sinkE) * 0.12 * VIEW_H, fly) - sinkE * 0.28,
        lerp(attachPos.z, 0.55, fly),
      );
      eul.set(lerp(0, 1.05, fly) + wig * 0.3 * Math.sin(fly * 7) + sinkE * 0.3, wig * 0.7, wig * 0.5 * Math.sin(fly * 5) + 0.14 * fly);
      freeQuat.setFromEuler(eul);
      qu.copy(attachQuat).slerp(freeQuat, fly);
      tag.position.copy(freePos);
      tag.quaternion.copy(qu);
      tag.scale.setScalar(lerp(attachS, targetS * (1 - sinkE * 0.3), fly));
    }

    /* formats: the two smaller packs */
    const row = SIGNALS.row(s);
    for (const [obj, spec, dir, spin] of [[pack50, packTracks.mid, 1, 0.1], [pack30, packTracks.sml, 1.6, -0.02]]) {
      obj.visible = row > 0.002;
      if (!obj.visible) continue;
      const e = smoother(clamp(row));
      const sc = (spec.h * VIEW_H) / 2.2;
      obj.position.set(spec.x * VIEW_W, spec.y * VIEW_H + (1 - e) * -VIEW_H * 0.9 * dir, 0);
      obj.scale.setScalar(sc * lerp(0.7, 1, e));
      obj.rotation.set(0.02, spin + (1 - e) * 1.4 + Math.sin(time * 0.4 + dir) * 0.03 * sway, 0);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function bgLum() {
    const c = lastBg.match(/\d+/g) || [255, 255, 255];
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  }

  // First frame ready: swap the poster for the live canvas, then keep measure() honest
  document.documentElement.classList.add('ready');
  requestAnimationFrame(frame);
  addEventListener('load', () => { measure(); buildStops(); });
  if (import.meta.env.DEV) window.__kranchi = { secMap, at, renderer, snap: () => { smoothScroll = scrollY; } };
}
