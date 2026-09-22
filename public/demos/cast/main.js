// the Cast — pull back and release a spear. One verb: the arc and the thunk.
// Three throws a round. The spear is a cannon-es body that STICKS where it lands.
// Donors: bowl/round (knob panel, bindRange/bindToggle, pointer gesture, noise-burst audio),
// warband (Character_Viking_Warrior_01 + SM_Wep_Spear_01 when present), step (phone 3D framing).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ---------------------------------------------------------------- knobs
const K = {
  power: 1.0,      // launch speed multiplier
  gravity: 1.0,    // × 9.82
  mass: 1.4,       // spear mass (kg)
  drag: 0.12,      // linear damping in flight
  wobble: 0.5,     // degrees of release scatter at full power
  pull: 0.34,      // full pull = this fraction of the screen diagonal
  hitStop: 5,      // physics frames frozen on the stick
  shake: 0.4,      // camera trauma on the stick
  thunk: 0.7,      // thunk volume
  arc: true, sound: true, haptics: true, shadows: true,
};

const MAX_SPEED = 16.5;        // m/s at full pull — full power lands just past the far ring
const MIN_ELEV = 3, MAX_ELEV = 78;
const THROWS = 3;
const FIXED_DT = 1 / 60;
const HAND = new THREE.Vector3(0.55, 1.78, 0);   // release point

// targets: x downrange, y centre height. ring = concentric rings on a stand.
const TARGETS = [
  { kind: 'ring', x: 7.5,  y: 1.40, r: 1.00, name: 'near', pts: [30, 15, 6] },
  { kind: 'dummy', x: 11.0, y: 0,   name: 'straw dummy', pts: [55, 25] },
  { kind: 'ring', x: 15.0, y: 1.65, r: 0.92, name: 'mid',  pts: [60, 30, 12] },
  { kind: 'ring', x: 20.5, y: 1.95, r: 0.84, name: 'far',  pts: [110, 55, 22] },
];

// ---------------------------------------------------------------- state
let renderer, scene, camera, world;
let spear = null;               // { mesh, body, stuck }
let stuckSpears = [];
let dragging = null;            // { x0, y0, x, y }
let arcPts, arcGeo;
let armPivot = null, figure = null;
let vk = null;                  // the War-Band viking once its glbs land
const RELEASE_AT = 0.55;        // where in the hurl clip the spear leaves the hand
let throwNo = 0, total = 0, last = 0, roundNo = 1, live = false;
let best = 0;
try { best = parseInt(localStorage.getItem('cast.best') || '0', 10) || 0; } catch (e) {}
let hitStopLeft = 0, trauma = 0, settleT = 0, lastHit = null;
let armPull = 0, armPullTarget = 0, armSnap = 0;
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3(9.5, 2.2, 0);
const camBack = new THREE.Vector3(-0.92, 0.40, 0.50).normalize();
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

const groundMat = new CANNON.Material('ground');
const spearMat = new CANNON.Material('spear');
const targetMat = new CANNON.Material('target');

// ---------------------------------------------------------------- textures (canvas, programmer art)
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function groundTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#6d7d52'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = ['#7b8b5c', '#63734a', '#87976a', '#5a6a43'][i & 3];
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
  }, [22, 22]);
}
function ringTex(R) {
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const bands = [[1.0, '#e7e2d2'], [0.55, '#c0442f'], [0.25, '#f5c451']];
    g.fillStyle = '#e7e2d2'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    for (const [f, col] of bands) { g.fillStyle = col; g.beginPath(); g.arc(c, c, c * f, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,30,20,.55)'; g.lineWidth = 3;
    for (const f of [1.0, 0.55, 0.25]) { g.beginPath(); g.arc(c, c, c * f - 1.5, 0, 7); g.stroke(); }
  });
}
function strawTex() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#c9a552'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = ['#b08e3d', '#dcbc69', '#9c7d33'][i % 3]; g.lineWidth = 1;
      const x = Math.random() * 64, y = Math.random() * 64;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-3, 3), y + rand(4, 10)); g.stroke();
    }
  });
}

// ---------------------------------------------------------------- audio
let actx = null, noiseBuf = null;
function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(actx.sampleRate * 0.25);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  if (actx.state === 'suspended') actx.resume();
}
// kind: 'wood' (ring/stand), 'straw' (dummy), 'dirt' (ground), 'whip' (release)
function thunk(kind, strength = 1) {
  if (!K.sound || !actx) return;
  const t = actx.currentTime, amp = clamp(strength, 0.15, 1.6) * K.thunk;
  const spec = {
    wood:  { f: 190, q: 6,  dur: 0.20, tone: 128, td: 0.13, g: 0.62 },
    straw: { f: 760, q: 1.1, dur: 0.16, tone: 0,   td: 0,    g: 0.40 },
    dirt:  { f: 320, q: 1.0, dur: 0.13, tone: 74,  td: 0.08, g: 0.32 },
    whip:  { f: 2600, q: 0.8, dur: 0.11, tone: 0,  td: 0,    g: 0.22 },
  }[kind] || { f: 300, q: 2, dur: 0.15, tone: 0, td: 0, g: 0.4 };
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.85, 1.2);
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.setValueAtTime(spec.f * rand(0.9, 1.1), t); bp.Q.value = spec.q;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, spec.g * amp), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
  src.connect(bp).connect(g).connect(actx.destination);
  src.start(t); src.stop(t + spec.dur + 0.02);
  if (spec.tone) {                       // the low body of the thunk
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(spec.tone * rand(0.94, 1.08), t);
    o.frequency.exponentialRampToValueAtTime(spec.tone * 0.55, t + spec.td);
    const og = actx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.5 * amp), t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + spec.td + 0.04);
    o.connect(og).connect(actx.destination);
    o.start(t); o.stop(t + spec.td + 0.06);
  }
}
function buzz(p) { if (K.haptics && navigator.vibrate) navigator.vibrate(p); }

// ---------------------------------------------------------------- build
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('c') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#2e3949');
  scene.fog = new THREE.Fog('#2e3949', 55, 175);
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);

  scene.add(new THREE.HemisphereLight(0xdceaff, 0x3c442e, 1.45));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
  sun.position.set(-8, 20, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -10;
  sun.shadow.camera.far = 70; sun.shadow.bias = -0.0015;
  scene.add(sun);

  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82 * K.gravity, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.5;
  world.addContactMaterial(new CANNON.ContactMaterial(spearMat, groundMat, { friction: 0.9, restitution: 0.02 }));
  world.addContactMaterial(new CANNON.ContactMaterial(spearMat, targetMat, { friction: 0.9, restitution: 0.02 }));

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 120),
    new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const gb = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
  gb.quaternion.setFromEuler(-Math.PI / 2, 0, 0); gb.userData = { hit: 'ground' };
  world.addBody(gb);

  // distance stripes so the arc reads against the range
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#57663f', roughness: 1 });
  for (let x = 5; x <= 25; x += 5) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 9), stripeMat);
    s.rotation.x = -Math.PI / 2; s.rotation.z = Math.PI / 2; s.position.set(x, 0.012, 0);
    scene.add(s);
  }

  buildFigure();
  for (const t of TARGETS) (t.kind === 'ring' ? buildRing : buildDummy)(t);
  buildArc();
  layout();
  addEventListener('resize', layout);
  newRound();
  requestAnimationFrame(loop);
  tryWarBand();
}

function buildFigure() {
  // capsule + cone stand-in; swapped for the War-Band viking if the glb loads (see tryWarBand)
  figure = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#b98a63', roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#5d6b8c', roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: '#8d959f', metalness: 0.6, roughness: 0.45 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 10), cloth);
  torso.position.y = 1.18; figure.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), skin);
  head.position.y = 1.72; figure.add(head);
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 12), iron);
  helm.position.y = 1.9; figure.add(helm);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), cloth);
    leg.position.set(s * 0.13, 0.45, s * 0.1); figure.add(leg);
  }
  // off arm
  const off = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), skin);
  off.position.set(0, 1.22, -0.33); off.rotation.x = 0.5; figure.add(off);

  // throwing arm — pivots at the shoulder, rotates about Z (the throw plane is X/Y)
  armPivot = new THREE.Group();
  armPivot.position.set(0.05, 1.5, 0.28);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.55, 4, 8), skin);
  upper.position.set(0.17, -0.2, 0); upper.rotation.z = -0.55;
  armPivot.add(upper);
  figure.add(armPivot);

  figure.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  figure.position.set(0, 0, 0);
  scene.add(figure);
}

function makeSpearMesh(len = 2.0) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5732', roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: '#aeb6c2', metalness: 0.75, roughness: 0.3 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, len * 0.82, 8), wood);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -len * 0.09; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, len * 0.2, 8), iron);
  head.rotation.z = -Math.PI / 2; head.position.x = len * 0.42; g.add(head);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 8), iron);
  butt.rotation.z = Math.PI / 2; butt.position.x = -len * 0.48; g.add(butt);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: '#3b3128', roughness: 1 }));
  grip.rotation.z = Math.PI / 2; grip.position.x = -len * 0.06; g.add(grip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.len = len;
  return g;
}

function buildRing(t) {
  const R = t.r;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, t.y, 0.14),
    new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1 }));
  post.position.set(t.x + 0.12, t.y / 2, 0); post.castShadow = true; scene.add(post);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, R * 1.1),
      new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1 }));
    leg.position.set(t.x + 0.12 + s * 0.25, 0.05, 0); leg.rotation.y = s * 0.3;
    leg.castShadow = true; scene.add(leg);
  }
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 30),
    [new THREE.MeshStandardMaterial({ color: '#8a7c60', roughness: 1 }),
     new THREE.MeshStandardMaterial({ map: ringTex(R), roughness: 0.95 }),
     new THREE.MeshStandardMaterial({ map: ringTex(R), roughness: 0.95 })]);
  face.rotation.z = Math.PI / 2;   // axis along X → flat face points down-range
  face.position.set(t.x, t.y, 0); face.castShadow = true; face.receiveShadow = true;
  scene.add(face);
  t.mesh = face;

  const body = new CANNON.Body({ mass: 0, material: targetMat,
    shape: new CANNON.Box(new CANNON.Vec3(0.06, R, R)) });
  body.position.set(t.x, t.y, 0);
  body.userData = { hit: 'ring', t };
  world.addBody(body);
  t.body = body;
}

function buildDummy(t) {
  const straw = new THREE.MeshStandardMaterial({ map: strawTex(), roughness: 1 });
  const bodyH = 1.05, bodyY = 0.95;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, bodyH, 0.68), straw);
  torso.position.set(t.x, bodyY, 0); torso.castShadow = true; scene.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), straw);
  head.position.set(t.x, bodyY + bodyH / 2 + 0.24, 0); head.castShadow = true; scene.add(head);
  const arms = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 1.5), straw);
  arms.position.set(t.x, bodyY + 0.3, 0); arms.castShadow = true; scene.add(arms);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12),
    new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1 }));
  pole.position.set(t.x, 0.22, 0); scene.add(pole);

  const b1 = new CANNON.Body({ mass: 0, material: targetMat,
    shape: new CANNON.Box(new CANNON.Vec3(0.25, bodyH / 2, 0.34)) });
  b1.position.set(t.x, bodyY, 0); b1.userData = { hit: 'dummy', t, part: 1 };
  world.addBody(b1);
  const b2 = new CANNON.Body({ mass: 0, material: targetMat,
    shape: new CANNON.Box(new CANNON.Vec3(0.21, 0.21, 0.21)) });
  b2.position.set(t.x, bodyY + bodyH / 2 + 0.24, 0); b2.userData = { hit: 'dummy', t, part: 0 };
  world.addBody(b2);
  t.bodies = [b1, b2];
}

function buildArc() {
  const N = 40;
  arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  const dot = canvasTex(32, 32, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(16, 16, 13, 0, 7); g.fill();
  });
  arcPts = new THREE.Points(arcGeo, new THREE.PointsMaterial({
    map: dot, color: 0xfff0c2, size: 0.27, sizeAttenuation: true,
    transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.35, fog: false,
  }));
  arcPts.visible = false; arcPts.frustumCulled = false;
  scene.add(arcPts);
}

// ---------------------------------------------------------------- the verb
function aimFromDrag(d) {
  // pull BACK (down-left) to throw forward-up. The reversed drag vector is the launch vector.
  const dx = d.x - d.x0, dy = d.y - d.y0;
  const len = Math.hypot(dx, dy);
  const full = Math.hypot(innerWidth, innerHeight) * K.pull;
  const power = clamp(len / full, 0, 1);
  // screen-y is down; a drag straight down (dy>0) with dx<0 → launch up and forward
  let elev = Math.atan2(dy, -dx) * 180 / Math.PI;   // 0 = flat forward, 90 = straight up
  if (len < 8) elev = 45;
  elev = clamp(elev, MIN_ELEV, MAX_ELEV);
  return { power, elev, len };
}
function launchVector(power, elevDeg, scatter) {
  const sp = MAX_SPEED * K.power * (0.22 + 0.78 * power);
  let e = elevDeg * Math.PI / 180;
  let yaw = 0;
  if (scatter) {
    const w = K.wobble * power * (Math.PI / 180);
    e += rand(-w, w); yaw = rand(-w, w);
  }
  return new CANNON.Vec3(Math.cos(e) * Math.cos(yaw) * sp, Math.sin(e) * sp, Math.sin(yaw) * sp);
}

// the spear leaves the actual hand when the viking is up; the cocked pose means a
// harder pull releases from further back, which is part of why the pull reads.
function releasePoint() {
  if (vk && vk.gripR) {
    const p = vk.gripR.getWorldPosition(new V3());
    if (p.y > 0.9 && p.y < 3 && Math.abs(p.x) < 2.5 && Math.abs(p.z) < 2) return p;
  }
  return HAND.clone();
}

// programmatic verb — the debug handle calls this
function cast(power = 0.7, elevDeg = 40) {
  if (spear && spear.stuck) { stuckSpears.push(spear); spear = null; }  // a scripted call never waits
  if (!live || spear) return false;
  power = clamp(power, 0, 1); elevDeg = clamp(elevDeg, MIN_ELEV, MAX_ELEV);
  const v = launchVector(power, elevDeg, true);
  const len = 2.0;
  const from = releasePoint();
  const mesh = makeSpearMesh(len);
  mesh.position.copy(from);
  scene.add(mesh);
  const body = new CANNON.Body({
    mass: K.mass, material: spearMat,
    shape: new CANNON.Box(new CANNON.Vec3(len / 2, 0.055, 0.055)),
    linearDamping: K.drag, angularDamping: 0.1,
  });
  body.position.set(from.x, from.y, from.z);
  body.velocity.copy(v);
  // point the shaft along the launch vector
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), new V3(v.x, v.y, v.z).normalize());
  body.quaternion.set(q.x, q.y, q.z, q.w);
  body.userData = { spear: true };
  body.addEventListener('collide', onSpearCollide);
  world.addBody(body);
  spear = { mesh, body, stuck: false, t0: performance.now() };
  armPullTarget = 0; armSnap = 1;
  if (vk) vk.released = true;          // let the hurl clip run through
  throwNo++;
  settleT = 0;
  thunk('whip', 0.6 + power * 0.6);
  buzz(8);
  refreshHud();
  return true;
}

function onSpearCollide(e) {
  if (!spear || spear.stuck) return;
  const other = e.body === spear.body ? e.target : e.body;
  const ud = other && other.userData;
  if (!ud) return;
  const v = spear.body.velocity.length();
  lastHit = { hit: ud.hit, part: ud.part };
  stick(ud, v);
}

function tipPoint() {
  const q = new THREE.Quaternion(spear.body.quaternion.x, spear.body.quaternion.y, spear.body.quaternion.z, spear.body.quaternion.w);
  const off = new V3(spear.mesh.userData.len * 0.5, 0, 0).applyQuaternion(q);
  return new V3(spear.body.position.x, spear.body.position.y, spear.body.position.z).add(off);
}

function stick(ud, speed) {
  const b = spear.body;
  // freeze exactly where it landed
  b.velocity.setZero(); b.angularVelocity.setZero();
  b.mass = 0; b.type = CANNON.Body.STATIC; b.updateMassProperties();
  b.removeEventListener('collide', onSpearCollide);
  spear.stuck = true;
  hitStopLeft = K.hitStop;
  trauma = Math.min(1, trauma + K.shake * clamp(speed / 16, 0.25, 1));

  const p = tipPoint();
  let pts = 0, label = 'miss', cls = 'miss';
  if (ud.hit === 'ring') {
    const t = ud.t;
    const r = Math.hypot(p.y - t.y, p.z);
    const band = r < t.r * 0.25 ? 0 : r < t.r * 0.55 ? 1 : 2;
    pts = t.pts[band];
    label = ['bullseye', 'inner ring', 'outer ring'][band] + ' · ' + t.name;
    cls = band === 0 ? 'bull' : '';
    thunk('wood', 0.8 + speed / 20);
    buzz(band === 0 ? [16, 24, 12] : 14);
  } else if (ud.hit === 'dummy') {
    pts = ud.t.pts[ud.part];
    label = ud.part === 0 ? 'the head · straw dummy' : 'the straw dummy';
    cls = ud.part === 0 ? 'bull' : '';
    thunk('straw', 0.9 + speed / 22);
    buzz(ud.part === 0 ? [16, 24, 12] : 12);
  } else {
    const d = Math.max(0, p.x);
    label = `short · ${d.toFixed(1)} m`;
    thunk('dirt', 0.6 + speed / 26);
    buzz(6);
  }
  total += pts; last = pts;
  showResult(pts, label, cls);
  refreshHud();
}

// ---------------------------------------------------------------- arc preview
function updateArc(power, elevDeg) {
  const pos = arcGeo.attributes.position.array;
  const N = pos.length / 3;
  if (!K.arc) { arcPts.visible = false; return; }
  const v = launchVector(power, elevDeg, false);
  const h = releasePoint();
  let px = h.x, py = h.y, pz = h.z;
  let vx = v.x, vy = v.y, vz = v.z;
  const g = -9.82 * K.gravity, damp = (1 - K.drag * FIXED_DT);
  let n = 0, step = 0;
  for (let i = 0; i < 620 && n < N; i++) {
    vy += g * FIXED_DT; vx *= damp; vy *= damp; vz *= damp;
    px += vx * FIXED_DT; py += vy * FIXED_DT; pz += vz * FIXED_DT;
    if (py < 0.03) break;
    if (step++ % 5 === 0) { pos[n * 3] = px; pos[n * 3 + 1] = py; pos[n * 3 + 2] = pz; n++; }
  }
  for (let i = n; i < N; i++) { pos[i * 3] = px; pos[i * 3 + 1] = -50; pos[i * 3 + 2] = pz; }
  arcGeo.attributes.position.needsUpdate = true;
  arcPts.visible = true;
}

// ---------------------------------------------------------------- rounds + hud
function newRound() {
  for (const s of stuckSpears) { scene.remove(s.mesh); world.removeBody(s.body); }
  stuckSpears = [];
  if (spear) { scene.remove(spear.mesh); world.removeBody(spear.body); spear = null; }
  throwNo = 0; total = 0; last = 0; live = true;
  $('over').classList.remove('show');
  hideResult(); refreshHud();
}
function endRound() {
  live = false;
  if (total > best) { best = total; try { localStorage.setItem('cast.best', String(best)); } catch (e) {} }
  $('overTotal').textContent = total;
  $('overTitle').textContent = total >= 200 ? 'A fine cast' : total === 0 ? 'All three in the dirt' : 'Three cast';
  $('overLine').textContent = `round ${roundNo} · ${total} points from ${THROWS} throws`;
  $('overBest').textContent = `best ${best}`;
  $('over').classList.add('show');
  refreshHud();
}
function showResult(pts, label, cls) {
  const s = $('score');
  s.textContent = pts > 0 ? `+${pts}` : 'stuck';
  s.className = pts > 0 ? cls : 'miss';
  $('math').textContent = label;
  $('result').classList.add('show');
}
function hideResult() { $('result').classList.remove('show'); }
function refreshHud() {
  $('roundno').textContent = `round ${roundNo}`;
  $('throwno').textContent = live ? `throw ${Math.min(THROWS, throwNo + (spear ? 0 : 1))} of ${THROWS}` : 'round over';
  $('total').textContent = total;
  const l = $('last'); l.textContent = last ? `last +${last}` : '';
  l.classList.toggle('over', last > 0);
  $('best').textContent = `best ${best}`;
}

// ---------------------------------------------------------------- input
function bindUI() {
  const cvs = $('c');
  const gauge = $('gauge'), gfill = $('gfill'), gtext = $('gtext');
  const start = (e) => {
    ensureAudio();
    if (!live || spear) return;
    dragging = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    hideResult();
    gauge.classList.add('show');
    try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const move = (e) => {
    if (!dragging) return;
    dragging.x = e.clientX; dragging.y = e.clientY;
    const a = aimFromDrag(dragging);
    armPullTarget = a.power;
    updateArc(a.power, a.elev);
    gfill.style.width = (a.power * 100).toFixed(0) + '%';
    gtext.textContent = `${a.elev.toFixed(0)}° · ${(a.power * 100).toFixed(0)}%`;
  };
  const end = (e) => {
    if (!dragging) return;
    const a = aimFromDrag(dragging);
    dragging = null;
    gauge.classList.remove('show');
    arcPts.visible = false;
    if (a.len < 14) { armPullTarget = 0; return; }   // a tap is not a throw
    cast(a.power, a.elev);
  };
  cvs.addEventListener('pointerdown', start);
  cvs.addEventListener('pointermove', move);
  cvs.addEventListener('pointerup', end);
  cvs.addEventListener('pointercancel', () => { dragging = null; armPullTarget = 0; $('gauge').classList.remove('show'); arcPts.visible = false; });

  $('again').addEventListener('click', () => { roundNo++; newRound(); });
  const panel = $('panel');
  $('gear').addEventListener('click', () => panel.classList.toggle('open'));
  bindRange('power', 0.4, 2.0, 0.05);
  bindRange('gravity', 0.3, 2.5, 0.05, () => world.gravity.set(0, -9.82 * K.gravity, 0));
  bindRange('mass', 0.4, 5, 0.1);
  bindRange('drag', 0, 0.6, 0.02);
  bindRange('wobble', 0, 6, 0.25);
  bindRange('pull', 0.15, 0.7, 0.01);
  bindRange('hitStop', 0, 14, 1);
  bindRange('shake', 0, 1, 0.05);
  bindRange('thunk', 0, 1.5, 0.05);
  bindToggle('arc'); bindToggle('sound'); bindToggle('haptics');
  bindToggle('shadows', () => {
    renderer.shadowMap.enabled = K.shadows;
    scene.traverse((o) => { if (o.isMesh) o.castShadow = K.shadows && o.castShadow !== undefined ? K.shadows : o.castShadow; });
  });
}
function bindRange(key, min, max, step, cb) {
  const row = document.querySelector(`[data-range="${key}"]`);
  if (!row) return;
  const input = row.querySelector('input'), out = row.querySelector('.val');
  input.min = min; input.max = max; input.step = step; input.value = K[key]; out.textContent = K[key];
  input.addEventListener('input', () => { K[key] = parseFloat(input.value); out.textContent = input.value; cb && cb(); });
}
function bindToggle(key, cb) {
  const el = document.querySelector(`[data-toggle="${key}"]`);
  if (!el) return;
  el.classList.toggle('sel', K[key]);
  el.addEventListener('click', () => { K[key] = !K[key]; el.classList.toggle('sel', K[key]); cb && cb(); });
}

// ---------------------------------------------------------------- camera
function layout() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const keys = [
    new V3(-1.8, 0, -2.2), new V3(-1.8, 2.2, 2.2),
    new V3(22.5, 0, -2.2), new V3(22.5, 3.0, 2.2),
    new V3(9.5, 7.3, 0),   // a full-power lob peaks near here — keep the arc in frame
  ];
  let dist = 12;
  for (let i = 0; i < 110; i++) {
    camera.position.copy(camLook).addScaledVector(camBack, dist);
    camera.lookAt(camLook); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    let fits = true;
    for (const k of keys) {
      const p = k.clone().project(camera);
      if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.90 || p.z > 1) { fits = false; break; }
    }
    if (fits) break;
    dist *= 1.035;
  }
  camBase.copy(camera.position);
}

// ---------------------------------------------------------------- loop
let lastT = 0, fpsAcc = 0, fpsN = 0, acc = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('fps').textContent = `${(fpsN / fpsAcc).toFixed(0)} fps`; fpsAcc = 0; fpsN = 0; }

  if (hitStopLeft > 0) hitStopLeft--;
  else {
    acc += dt;
    while (acc >= FIXED_DT) { world.step(FIXED_DT); acc -= FIXED_DT; }
  }

  if (spear) {
    const b = spear.body;
    spear.mesh.position.set(b.position.x, b.position.y, b.position.z);
    if (!spear.stuck) {
      // keep the spear nose-first along its velocity
      const v = new V3(b.velocity.x, b.velocity.y, b.velocity.z);
      if (v.lengthSq() > 0.6) {
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), v.clone().normalize());
        b.quaternion.slerp(new CANNON.Quaternion(q.x, q.y, q.z, q.w), 0.35, b.quaternion);
        b.angularVelocity.setZero();
      }
      b.linearDamping = K.drag;
      if (b.position.y < -3 || b.position.x > 60 || performance.now() - spear.t0 > 9000) stick({ hit: 'ground' }, 6);
    }
    spear.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    if (spear.stuck) {
      settleT += dt;
      if (settleT > 1.05) {
        stuckSpears.push(spear); spear = null;
        if (throwNo >= THROWS) endRound(); else refreshHud();
      }
    }
  }

  // the arm. With the viking: the drag SCRUBS the wind-up half of the hurl clip and
  // release lets it run through. Without: the capsule arm cocks and snaps.
  armPull += (armPullTarget - armPull) * Math.min(1, dt * 14);
  if (armSnap > 0) armSnap = Math.max(0, armSnap - dt * 5.5);
  if (vk) {
    if (vk.wep) vk.wep.visible = !spear;
    if (vk.action) {
      if (vk.released) {
        vk.action.paused = false;
        vk.mixer.update(dt);
        if (!spear) { vk.released = false; vk.action.time = 0; vk.action.paused = true; vk.mixer.update(0); }
      } else {
        vk.action.paused = true;
        vk.action.time = armPull * RELEASE_AT * vk.dur;
        vk.mixer.update(0);
      }
    }
  } else if (armPivot) {
    const back = armPull * 1.35;              // cocked
    const through = armSnap * 1.5;            // follow-through
    armPivot.rotation.z = -0.35 + back - through;
    if (figure) figure.rotation.z = (armPull * 0.07) - armSnap * 0.09;
  }

  // shake
  trauma = Math.max(0, trauma - dt * 1.9);
  const s = trauma * trauma * 0.34;
  camera.position.set(camBase.x + rand(-s, s), camBase.y + rand(-s, s), camBase.z + rand(-s, s));
  camera.lookAt(camLook);

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- War-Band figure
// Character_Viking_Warrior_01 + SM_Wep_Spear_01 in the Hand_R grip + the `hurl` clip.
// Retarget is free: the anim glb is skeleton-only and the bone names match 1:1, so
// mixer.clipAction(clip) binds straight onto the figure (warband donor).
// The wind-up half of the clip is SCRUBBED by the drag; release unpauses it and it
// plays through the follow-through. If anything fails to load the capsule figure stands.
async function tryWarBand() {
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const mgr = new THREE.LoadingManager();
    // the Synty glbs carry a baked '..\\_working\\Texture_01.png' path that 404s; every
    // material is replaced below anyway, so point the request at the atlas we do ship.
    mgr.setURLModifier((url) => (/Texture_01|_working/.test(url) ? './assets/synty_chars.png' : url));
    const loader = new GLTFLoader(mgr);
    const tex = (p) => { const t = new THREE.TextureLoader().load(p); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; };
    const charAtlas = tex('./assets/synty_chars.png'), propAtlas = tex('./assets/synty_atlas.png');
    const [figG, wepG, animG] = await Promise.all([
      loader.loadAsync('./assets/Character_Viking_Warrior_01.glb'),
      loader.loadAsync('./assets/SM_Wep_Spear_01.glb'),
      loader.loadAsync('./assets/hurl.glb'),
    ]);

    const model = figG.scene;
    model.traverse((n) => {
      if ((n.isMesh || n.isSkinnedMesh) && n.material) {
        n.material = new THREE.MeshLambertMaterial({ map: charAtlas, emissive: 0x8a8a8a, emissiveMap: charAtlas });
        n.castShadow = true; n.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new V3());
    const s = 1.8 / (size.y || 1.8);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;

    // the spear in the hand (Synty ships centimetres — normalise by measurement)
    const wep = wepG.scene;
    wep.traverse((n) => { if (n.isMesh) { n.material = new THREE.MeshLambertMaterial({ map: propAtlas, emissive: 0x6a6a6a, emissiveMap: propAtlas }); n.castShadow = true; } });
    const wbox = new THREE.Box3().setFromObject(wep), wdim = wbox.getSize(new V3());
    if (Math.max(wdim.x, wdim.y, wdim.z) > 10) wep.scale.multiplyScalar(0.01);

    const bones = {};
    model.traverse((n) => { if (n.isBone) bones[n.name] = n; });
    let gripR = null;
    if (bones.Hand_R) {
      gripR = new THREE.Group();
      bones.Hand_R.add(gripR);
      gripR.position.set(-0.04, 0.07, 0.04);          // the manifest's tuned spear grip
      gripR.rotation.set(-1.64, -0.32, 0.82);
      gripR.add(wep);
    }

    const mixer = new THREE.AnimationMixer(model);
    const clip = animG.animations.find((a) => a.name === 'hurl') || animG.animations[0];
    let action = null;
    if (clip) {
      action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true; action.time = 0;
      mixer.update(0);
    }

    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.rotation.y = Math.PI / 2;                    // face down-range (+X)
    // the capsule stand-in steps aside
    for (const c of [...figure.children]) figure.remove(c);
    armPivot = null;
    figure.add(wrap);
    vk = { model, mixer, action, gripR, wep, dur: clip ? clip.duration : 0 };
  } catch (e) {
    console.warn('War-Band figure unavailable — capsule stands in', e);
  }
}

init();
bindUI();

window.cast = {
  K, TARGETS,
  cast,                                   // cast(power 0..1, elevationDeg) — performs the verb once
  newRound, layout, camLook, camBack, camera: () => camera,
  get total() { return total; },
  get last() { return last; },
  get best() { return best; },
  get throwNo() { return throwNo; },
  get live() { return live; },
  get spear() { return spear; },
  get stuck() { return spear ? spear.stuck : false; },
  get lastHit() { return lastHit; },
  get landed() { return spear && spear.stuck ? tipPoint() : null; },
};
