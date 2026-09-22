// the Bowl — a Kiln toy. One verb: flick a die up a lane into a pin rack.
// Score per throw = pins down × the face the die lands on. Dice donor: the Theater (cannon-es + three).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DICE_DATA, DIE_THEMES } from './dicedata.js';

// ---------------------------------------------------------------- knobs
const K = {
  die: 'd20',
  power: 1.0,      // multiplier on flick speed
  spin: 18,        // forward roll magnitude
  gravity: 7,
  pinMass: 0.22,   // light pins knock + flit; the die is the heavy thing
  pinBounce: 0.45, // pin↔pin and die↔pin restitution
  size: 1.15,
  bumpers: true,
  sound: true,
  haptics: true,
  shadows: true,
};
const LANE_W = 8, LANE_L = 30;     // x: -4..4, z: -15..15, player at +z
const PIN_Z = -8.5, PIN_S = 1.3;   // headpin row, spacing
const PIN_R = 0.38, PIN_H = 1.6;   // belly radius, height — real pin proportions
const THROWS = 3;
const SETTLE_TIMEOUT = 5000;
const FIXED_DT = 1 / 60;

// ---------------------------------------------------------------- state
let renderer, scene, camera, world;
let die = null;
let pins = [];
let rolling = false, rollStart = 0, settleFrames = 0;
let round = { throwNo: 0, total: 0 };
let best = 0;
try { best = parseInt(localStorage.getItem('bowl.best') || '0', 10) || 0; } catch (e) {}
let wallBodies = [];
let cmPinFloor, cmDiePin, cmPinPin;
const matCache = {}, geoCache = {};
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- face textures (Theater donor)
function makeFaceTexture(bodyColor, numColor, label, opts = {}) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = bodyColor;
  g.fillRect(0, 0, S, S);
  if (label != null) {
    const px = opts.px || 56;
    g.fillStyle = numColor;
    g.font = `bold ${px}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const s = String(label);
    g.fillText(s, S / 2, S / 2 + 2);
    if (label === 6 || label === 9) g.fillText('.', S / 2 + g.measureText(s).width / 2 + px * 0.14, S / 2 + 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildDieGeometry(type) {
  if (geoCache[type]) return geoCache[type];
  const data = DICE_DATA[type];
  const verts = data.vertices.map((v) => { const w = new V3(...v); return data.noNormalize ? w : w.normalize(); });
  const pos = [], uv = [], groups = [], faceInfo = [];
  let cursor = 0;
  data.faces.forEach((f) => {
    const label = f[f.length - 1];
    let idxs = f.slice(0, f.length - 1);
    let fv = idxs.map((i) => verts[i]);
    const centroid = fv.reduce((a, b) => a.clone().add(b), new V3()).multiplyScalar(1 / fv.length);
    let n = new V3().subVectors(fv[1], fv[0]).cross(new V3().subVectors(fv[2], fv[0])).normalize();
    if (n.dot(centroid) < 0) { idxs = idxs.slice().reverse(); fv = fv.slice().reverse(); n = n.negate(); }
    const t = new V3().subVectors(fv[0], centroid).normalize();
    const b = new V3().crossVectors(n, t);
    let maxR = 0;
    const flat = fv.map((v) => { const d = new V3().subVectors(v, centroid); const x = d.dot(t), y = d.dot(b); maxR = Math.max(maxR, Math.hypot(x, y)); return [x, y]; });
    const uvs = flat.map(([x, y]) => [0.5 + (x / maxR) * 0.42, 0.5 + (y / maxR) * 0.42]);
    const start = cursor;
    for (let i = 1; i < idxs.length - 1; i++) {
      for (const j of [0, i, i + 1]) { pos.push(fv[j].x, fv[j].y, fv[j].z); uv.push(uvs[j][0], uvs[j][1]); }
      cursor += 3;
    }
    groups.push({ start, count: cursor - start, face: label === -1 ? -1 : faceInfo.length });
    if (label !== -1) faceInfo.push({ normal: n.clone(), label, dist: n.dot(centroid) });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  groups.forEach((gr) => geo.addGroup(gr.start, gr.count, gr.face === -1 ? 0 : 1 + gr.face));
  const cVerts = verts.map((v) => new CANNON.Vec3(v.x, v.y, v.z));
  const cFaces = data.faces.map((f) => {
    const idxs = f.slice(0, f.length - 1);
    const a = verts[idxs[0]], b2 = verts[idxs[1]], c2 = verts[idxs[2]];
    const n = new V3().subVectors(b2, a).cross(new V3().subVectors(c2, a));
    const centroid = idxs.reduce((acc, i) => acc.add(verts[i]), new V3()).multiplyScalar(1 / idxs.length);
    return n.dot(centroid) < 0 ? idxs.slice().reverse() : idxs;
  });
  geoCache[type] = { geo, faceInfo, cVerts, cFaces, data };
  return geoCache[type];
}

function buildMaterials(type) {
  if (matCache[type]) return matCache[type];
  const [body, num] = DIE_THEMES[type];
  const { faceInfo } = buildDieGeometry(type);
  const mats = [matFor(makeFaceTexture(body, num, null))];
  const px = type === 'd10' ? 34 : type === 'd20' ? 44 : 56;
  for (const fi of faceInfo) mats.push(matFor(makeFaceTexture(body, num, fi.label, { px })));
  matCache[type] = mats;
  return mats;
}
const matFor = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 });

// ---------------------------------------------------------------- bodies
const diceMat = new CANNON.Material('dice');
const floorMat = new CANNON.Material('floor');
const pinMat = new CANNON.Material('pin');

class Die {
  constructor(type) {
    this.type = type;
    const { geo, faceInfo, cVerts, cFaces, data } = buildDieGeometry(type);
    this.faceInfo = faceInfo;
    this.scale = data.scale * K.size;
    this.mesh = new THREE.Mesh(geo, buildMaterials(type));
    this.mesh.scale.setScalar(this.scale);
    this.mesh.castShadow = K.shadows;
    scene.add(this.mesh);
    const shape = new CANNON.ConvexPolyhedron({
      vertices: cVerts.map((v) => new CANNON.Vec3(v.x * this.scale, v.y * this.scale, v.z * this.scale)),
      faces: cFaces.map((f) => f.slice()),
    });
    this.body = new CANNON.Body({ mass: 2.8, shape, material: diceMat, allowSleep: true });
    this.body.sleepSpeedLimit = 0.55;
    this.body.sleepTimeLimit = 0.1;
    this.body.linearDamping = 0.15;
    this.body.angularDamping = 0.15;
    this.body.addEventListener('collide', onCollide);
    world.addBody(this.body);
  }
  readUp() {
    const q = this.body.quaternion;
    let bestY = -2, bi = 0;
    this.faceInfo.forEach((fi, i) => {
      const w = q.vmult(new CANNON.Vec3(fi.normal.x, fi.normal.y, fi.normal.z));
      if (w.y > bestY) { bestY = w.y; bi = i; }
    });
    return this.faceInfo[bi].label;
  }
  sync() { this.mesh.position.copy(this.body.position); this.mesh.quaternion.copy(this.body.quaternion); }
  dispose() { scene.remove(this.mesh); this.body.removeEventListener('collide', onCollide); world.removeBody(this.body); }
}

let pinGeo = null, pinMatl = null, pinDownMatl = null, stripeGeo = null, stripeMatl = null;
// bowling-pin profile (radius per height fraction): base, belly, waist, neck, head
const PIN_PROFILE = [[0, 0.55], [0.06, 0.8], [0.22, 1.0], [0.4, 0.92], [0.55, 0.6], [0.66, 0.42], [0.78, 0.5], [0.9, 0.42], [0.98, 0.2], [1, 0]];
function makePinGeo() {
  const pts = PIN_PROFILE.map(([h, r]) => new THREE.Vector2(r * PIN_R, h * PIN_H - PIN_H / 2));
  return new THREE.LatheGeometry(pts, 20);
}
class Pin {
  constructor(x, z) {
    this.home = new CANNON.Vec3(x, PIN_H / 2 + 0.01, z);
    pinGeo = pinGeo || makePinGeo();
    pinMatl = pinMatl || new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 0.35 });
    pinDownMatl = pinDownMatl || new THREE.MeshStandardMaterial({ color: '#e05a4a', roughness: 0.4 });
    stripeGeo = stripeGeo || new THREE.TorusGeometry(PIN_R * 0.5 + 0.012, 0.03, 8, 24);
    stripeMatl = stripeMatl || new THREE.MeshStandardMaterial({ color: '#d0362c', roughness: 0.5 });
    this.mesh = new THREE.Mesh(pinGeo, pinMatl);
    this.mesh.castShadow = K.shadows;
    for (const h of [0.72, 0.8]) { // the two neck stripes that sell the look
      const ring = new THREE.Mesh(stripeGeo, stripeMatl);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h * PIN_H - PIN_H / 2;
      ring.scale.setScalar(h === 0.72 ? 1 : 0.92);
      this.mesh.add(ring);
    }
    scene.add(this.mesh);
    // compound body: fat belly cylinder low + slim neck cylinder high → bottom-heavy but tips easily
    this.body = new CANNON.Body({ mass: K.pinMass, material: pinMat, allowSleep: true });
    this.body.addShape(new CANNON.Cylinder(PIN_R * 0.85, PIN_R * 0.7, PIN_H * 0.5, 10), new CANNON.Vec3(0, -PIN_H * 0.22, 0));
    this.body.addShape(new CANNON.Cylinder(PIN_R * 0.45, PIN_R * 0.55, PIN_H * 0.5, 8), new CANNON.Vec3(0, PIN_H * 0.25, 0));
    this.body.sleepSpeedLimit = 0.4;
    this.body.sleepTimeLimit = 0.15;
    this.body.linearDamping = 0.12;
    this.body.angularDamping = 0.1;
    this.body.addEventListener('collide', onCollide);
    world.addBody(this.body);
    this.reset();
  }
  reset() {
    this.body.mass = K.pinMass; this.body.updateMassProperties();
    this.body.position.copy(this.home);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.sleep();
    this.mesh.material = pinMatl;
    this.down = false;
    this.sync();
  }
  isDown() {
    const up = this.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const moved = this.body.position.distanceTo(this.home);
    return up.y < 0.82 || moved > 0.7;
  }
  sync() { this.mesh.position.copy(this.body.position); this.mesh.quaternion.copy(this.body.quaternion); }
}

function buildRack() {
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i <= r; i++) {
      pins.push(new Pin((i - r / 2) * PIN_S, PIN_Z - r * PIN_S * 0.87));
    }
  }
}
function resetRack() { for (const p of pins) p.reset(); }

// ---------------------------------------------------------------- audio + haptics (Theater donor)
let audioCtx = null, noiseBuf = null, lastClick = 0;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const len = audioCtx.sampleRate * 0.04;
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function click(strength, pitch = 1) {
  const now = performance.now();
  if (now - lastClick < 25) return;
  lastClick = now;
  if (K.sound && audioCtx) {
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rand(0.8, 1.6) * pitch;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1400, 2600) * pitch;
    bp.Q.value = 1.2;
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(0.5, strength * 0.12);
    src.connect(bp).connect(gain).connect(audioCtx.destination);
    src.start();
  }
  if (K.haptics && navigator.vibrate) navigator.vibrate(6);
}
function onCollide(e) {
  const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
  if (v <= 1.0 || !rolling) return;
  const pinHit = e.body.material === pinMat || e.target.material === pinMat;
  click(v * 0.4, pinHit ? 0.55 : 1);
}

// ---------------------------------------------------------------- scene
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('c') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#131a16');
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xdfffe8, 0x1c2a21, 0.9));
  const dir = new THREE.DirectionalLight(0xfff2dd, 2.0);
  dir.position.set(6, 18, 4);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -10; dir.shadow.camera.right = 10;
  dir.shadow.camera.top = 20; dir.shadow.camera.bottom = -20;
  scene.add(dir);

  // lane
  const fc = document.createElement('canvas');
  fc.width = 256; fc.height = 1024;
  const fg = fc.getContext('2d');
  fg.fillStyle = '#6a4a2c'; fg.fillRect(0, 0, 256, 1024);
  fg.fillStyle = '#5b3f25';
  for (let i = 0; i < 8; i++) fg.fillRect(i * 32 + (i % 2 ? 0 : 4), 0, 6, 1024); // boards
  fg.fillStyle = 'rgba(255,255,255,.08)';
  fg.fillRect(0, 780, 256, 4); // foul line
  const ftex = new THREE.CanvasTexture(fc);
  ftex.colorSpace = THREE.SRGBColorSpace;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, LANE_L), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.6 }));
  lane.rotation.x = -Math.PI / 2;
  lane.receiveShadow = true;
  scene.add(lane);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#1a231d', roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.01;
  scene.add(apron);
  // visible bumper rails
  const railMat = new THREE.MeshStandardMaterial({ color: '#2b3a31', roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, LANE_L), railMat);
    rail.position.set(sx * (LANE_W / 2 + 0.25), 0.3, 0);
    rail.castShadow = true; rail.receiveShadow = true;
    scene.add(rail);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 1, 0.6, 0.5), railMat);
  back.position.set(0, 0.3, -LANE_L / 2 - 0.25);
  scene.add(back);

  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82 * K.gravity, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.3;
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat, { friction: 0.25, restitution: 0.12 }));
  cmPinFloor = new CANNON.ContactMaterial(pinMat, floorMat, { friction: 0.28, restitution: 0.15 }); world.addContactMaterial(cmPinFloor);
  cmDiePin = new CANNON.ContactMaterial(diceMat, pinMat, { friction: 0.15, restitution: K.pinBounce }); world.addContactMaterial(cmDiePin);
  cmPinPin = new CANNON.ContactMaterial(pinMat, pinMat, { friction: 0.2, restitution: K.pinBounce }); world.addContactMaterial(cmPinPin);
  const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);

  buildWalls();
  buildRack();
  layout();
  addEventListener('resize', layout);
  refreshRound();
  requestAnimationFrame(loop);
}

function buildWalls() {
  for (const b of wallBodies) world.removeBody(b);
  wallBodies = [];
  const t = 1, H = 30;
  const defs = [[0, -LANE_L / 2 - t / 2, new CANNON.Vec3(LANE_W / 2 + 3, H, t / 2)]]; // back wall always
  if (K.bumpers) {
    defs.push([LANE_W / 2 + t / 2, 0, new CANNON.Vec3(t / 2, H, LANE_L / 2 + t)]);
    defs.push([-LANE_W / 2 - t / 2, 0, new CANNON.Vec3(t / 2, H, LANE_L / 2 + t)]);
  }
  for (const [x, z, half] of defs) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(half), material: floorMat });
    b.position.set(x, H / 2 - 0.01, z);
    world.addBody(b);
    wallBodies.push(b);
  }
}

function layout() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, 13, LANE_L / 2 + 9);
  camera.lookAt(0, 0, -2);
  camera.updateProjectionMatrix();
  const corners = [new V3(-LANE_W / 2 - 1, 0, -LANE_L / 2 - 1), new V3(LANE_W / 2 + 1, 0, -LANE_L / 2 - 1), new V3(-LANE_W / 2 - 1, 0, LANE_L / 2), new V3(LANE_W / 2 + 1, 0, LANE_L / 2)];
  const dirv = new V3().subVectors(camera.position, new V3(0, 0, -2)).normalize();
  for (let i = 0; i < 80; i++) {
    camera.updateMatrixWorld();
    let fits = true;
    for (const c of corners) { const p = c.clone().project(camera); if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.92) { fits = false; break; } }
    if (fits) break;
    camera.position.addScaledVector(dirv, 0.5);
    camera.lookAt(0, 0, -2);
  }
}

// ---------------------------------------------------------------- throwing
function throwDie(startX, dirX, dirZ, speed) {
  if (rolling) return;
  if (round.throwNo >= THROWS) newRound();
  ensureAudio();
  if (die) die.dispose();
  resetRack();
  hideResult();
  die = new Die(K.die);
  const sx = Math.max(-LANE_W / 2 + 1, Math.min(LANE_W / 2 - 1, startX));
  die.body.position.set(sx, die.scale + 0.3, LANE_L / 2 - 2.5);
  die.body.velocity.set(dirX * speed, speed * 0.12, dirZ * speed);
  die.body.quaternion.setFromEuler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
  // forward roll: spin axis perpendicular to travel, plus a little wobble
  const ax = dirZ, az = -dirX;
  die.body.angularVelocity.set(ax * K.spin + rand(-3, 3), rand(-3, 3), az * K.spin + rand(-3, 3));
  die.body.wakeUp();
  for (const p of pins) p.body.wakeUp();
  rolling = true;
  rollStart = performance.now();
  settleFrames = 0;
  round.throwNo++;
  refreshRound();
}

// settled = everything slow, not everything asleep: a wobbling pin can take seconds to reach SLEEPING
function allSettled() {
  const slow = (b, v, w) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < v && b.angularVelocity.length() < w);
  if (!slow(die.body, 0.25, 0.6)) return false;
  for (const p of pins) if (!slow(p.body, 0.2, 0.8)) return false;
  return true;
}

function finishThrow() {
  rolling = false;
  const face = die.readUp();
  let downN = 0;
  for (const p of pins) { p.down = p.isDown(); if (p.down) { downN++; p.mesh.material = pinDownMatl; } }
  const pts = downN * face;
  round.total += pts;
  if (round.total > best) { best = round.total; try { localStorage.setItem('bowl.best', String(best)); } catch (e) {} }
  showResult(pts, `${downN} pin${downN === 1 ? '' : 's'} × ${face}` + (downN === pins.length ? ' · STRIKE' : ''));
  if (downN === pins.length) { click(3, 1.4); setTimeout(() => click(3, 1.8), 90); }
  refreshRound();
}

function newRound() { round = { throwNo: 0, total: 0 }; refreshRound(); }

// ---------------------------------------------------------------- loop
let acc = 0, lastT = 0, fpsN = 0, fpsT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastT) / 1000, 0.1);
  lastT = t;
  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { document.getElementById('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n++ < 4) { world.step(FIXED_DT); acc -= FIXED_DT; }
  if (die) die.sync();
  for (const p of pins) p.sync();
  if (rolling) {
    if (allSettled()) { if (++settleFrames > 12) finishThrow(); } else settleFrames = 0;
    if (performance.now() - rollStart > SETTLE_TIMEOUT) finishThrow();
    if (die.body.position.y < -4) { die.body.position.set(0, 3, 0); die.body.velocity.set(0, 0, 0); }
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- UI
function showResult(pts, math) {
  document.getElementById('score').textContent = pts;
  document.getElementById('math').textContent = math;
  document.getElementById('result').classList.add('show');
}
function hideResult() { document.getElementById('result').classList.remove('show'); }
function refreshRound() {
  document.getElementById('throwno').textContent = round.throwNo >= THROWS ? 'round over' : `throw ${Math.min(THROWS, round.throwNo + 1)} of ${THROWS}`;
  document.getElementById('total').textContent = `round ${round.total}`;
  document.getElementById('best').textContent = `best ${best}`;
}

function bindUI() {
  const cvs = document.getElementById('c');
  let p0 = null, samples = [];
  cvs.addEventListener('pointerdown', (e) => { p0 = { x: e.clientX, y: e.clientY, t: performance.now() }; samples = [p0]; ensureAudio(); });
  cvs.addEventListener('pointermove', (e) => { if (!p0) return; samples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (samples.length > 6) samples.shift(); });
  cvs.addEventListener('pointerup', (e) => {
    if (!p0) return;
    const end = { x: e.clientX, y: e.clientY, t: performance.now() };
    const ref = samples[0];
    const dt = Math.max(end.t - ref.t, 1);
    const vx = (end.x - ref.x) / dt, vy = (end.y - ref.y) / dt;
    const sp = Math.hypot(vx, vy);
    const startX = (p0.x / innerWidth - 0.5) * (LANE_W - 1.5);
    p0 = null;
    if (sp < 0.25 || vy > 0) return; // needs an upward flick
    const len = Math.hypot(vx, vy) || 1;
    const speed = Math.min(48, Math.max(8, sp * 22)) * K.power;
    throwDie(startX, vx / len, vy / len, speed);
  });
  cvs.addEventListener('pointercancel', () => { p0 = null; });

  document.getElementById('reset').addEventListener('click', () => { if (!rolling) { newRound(); resetRack(); hideResult(); } });
  const panel = document.getElementById('panel');
  document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
  bindSeg('die', ['d6', 'd8', 'd12', 'd20']);
  bindRange('power', 0.5, 2, 0.05);
  bindRange('spin', 0, 40, 1);
  bindRange('gravity', 2, 14, 0.5, () => world.gravity.set(0, -9.82 * K.gravity, 0));
  bindRange('pinMass', 0.08, 1.0, 0.02, resetRack);
  bindRange('pinBounce', 0, 0.9, 0.05, () => { cmDiePin.restitution = K.pinBounce; cmPinPin.restitution = K.pinBounce; });
  bindRange('size', 0.7, 1.6, 0.05);
  bindToggle('bumpers', buildWalls);
  bindToggle('sound');
  bindToggle('haptics');
  bindToggle('shadows', () => { renderer.shadowMap.enabled = K.shadows; if (die) die.mesh.castShadow = K.shadows; for (const p of pins) p.mesh.castShadow = K.shadows; });
}
function bindSeg(key, opts, cb) {
  const host = document.querySelector(`[data-seg="${key}"]`);
  host.innerHTML = opts.map((o) => `<button data-v="${o}" class="${K[key] === o ? 'sel' : ''}">${o}</button>`).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    K[key] = b.dataset.v;
    host.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
    cb && cb();
  });
}
function bindRange(key, min, max, step, cb) {
  const row = document.querySelector(`[data-range="${key}"]`);
  const input = row.querySelector('input'), out = row.querySelector('.val');
  input.min = min; input.max = max; input.step = step; input.value = K[key];
  out.textContent = K[key];
  input.addEventListener('input', () => { K[key] = parseFloat(input.value); out.textContent = input.value; cb && cb(); });
}
function bindToggle(key, cb) {
  const el = document.querySelector(`[data-toggle="${key}"]`);
  el.classList.toggle('sel', K[key]);
  el.addEventListener('click', () => { K[key] = !K[key]; el.classList.toggle('sel', K[key]); cb && cb(); });
}

init();
bindUI();
window.bowl = { K, throwDie, get die() { return die; }, get pins() { return pins; } };
