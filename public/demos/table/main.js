// the Table — flip the flippers. Portrait pinball: a d20 on a tilted plane, two flippers,
// three bumpers, a plunger lane, a drain. The whole toy exists to answer one question:
// is a flipper hit satisfying? Everything else is scaffolding around that half-second.
// Donors: ~/Projects/kiln/bowl/round (physics loop, knob panel, click/haptics, camera fit).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ---------------------------------------------------------------- knobs
const K = {
  flipPower: 7,     // impulse added on a live flipper hit (the whack on top of the sweep)
  flipSpeed: 13,    // rad/s of the flipper sweep — the sweep itself does most of the work
  tipBias: 0.75,    // 0 = same power anywhere, 1 = all the power at the tip
  tilt: 8.0,        // gravity component down the table
  bumper: 11,       // radial impulse a bumper gives the ball
  launch: 26,       // plunger launch speed at full pull
  sound: true, haptics: true, shadows: true,
};

// ---------------------------------------------------------------- table geometry (XZ plane, +z = down toward the drain)
const HW = 5.0;                 // half width of the outer box
const TOP = -9.4, BOT = 9.4;    // z extents
const LANE_X = 3.55;            // inner wall of the plunger lane
const LANE_TOP = -4.2;          // where the lane opens into the playfield
const BALL_R = 0.42;
const PIVOT_Z = 7.35, PIVOT_X = 2.55;
const FLIP_LEN = 2.05, FLIP_W = 0.46;
const FLIP_H = 1.5;      // body is wall-tall so the ball can never ride up onto the paddle
const FLIP_VH = 0.5;     // the visible paddle is short and sits on the deck
const REST_A = 0.49, UP_A = -0.47;   // left flipper angles (right is mirrored)
const DRAIN_Z = 9.0;
const BUMPERS = [[-2.3, -3.4], [1.4, -4.8], [-0.3, -1.1]];
const BUMP_R = 0.78;
const FIXED_DT = 1 / 120;

// ---------------------------------------------------------------- state
let renderer, scene, camera, world;
let ball, ballMesh, flippers = [], bumps = [], plungerMesh;
let score = 0, balls = 3, best = 0, waiting = true, dead = false;
try { best = parseInt(localStorage.getItem('table.best') || '0', 10) || 0; } catch (e) {}
let trauma = 0, noiseT = 0, pull = 0;
const camBase = new THREE.Vector3();
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- audio + haptics (bowl/round donor)
let audioCtx = null, noiseBuf = null, lastClick = 0;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(audioCtx.sampleRate * 0.05);
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function click(strength, pitch = 1, gap = 22) {
  const now = performance.now();
  if (now - lastClick < gap) return;
  lastClick = now;
  if (K.sound && audioCtx) {
    const src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = (0.8 + Math.random() * 0.6) * pitch;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = (1200 + Math.random() * 1400) * pitch; bp.Q.value = 1.4;
    const gain = audioCtx.createGain(); gain.gain.value = Math.min(0.55, strength * 0.12);
    src.connect(bp).connect(gain).connect(audioCtx.destination); src.start();
  }
}
function buzz(p) { if (K.haptics && navigator.vibrate) navigator.vibrate(p); }

// ---------------------------------------------------------------- materials
const ballMat = new CANNON.Material('ball');
const wallMat = new CANNON.Material('wall');
const flipMat = new CANNON.Material('flip');
const bumpMat = new CANNON.Material('bump');
const floorMat = new CANNON.Material('floor');

const woodMat = new THREE.MeshStandardMaterial({ color: '#16233a', roughness: 0.85 });
const railMat = new THREE.MeshStandardMaterial({ color: '#33506f', roughness: 0.6, metalness: 0.2 });

// ---------------------------------------------------------------- build
function wall(x1, z1, x2, z2, t = 0.34, h = 1.5) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  const ang = Math.atan2(-dz, dx);                 // rotation about +y
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const half = new CANNON.Vec3(len / 2 + t / 2, h / 2, t / 2);
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(half), material: wallMat });
  b.position.set(cx, h / 2, cz);
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ang);
  world.addBody(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + t, h, t), railMat);
  m.position.copy(b.position); m.quaternion.copy(b.quaternion);
  m.castShadow = K.shadows; m.receiveShadow = true;
  scene.add(m);
  return b;
}

class Flipper {
  constructor(side) {              // side: -1 left, +1 right
    this.side = side;
    // rotation about +y: paddle dir = (-side*cos a, side*sin a) in (x,z)
    // left  rest -0.49 (points right+down) -> up +0.47 ;  right is the mirror
    this.rest = side * REST_A;
    this.up = side * UP_A;
    this.armed = false;
    this.ang = this.rest;
    this.target = this.rest;
    this.omega = 0;
    this.px = side * PIVOT_X; this.pz = PIVOT_Z;
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: flipMat });
    const shape = new CANNON.Box(new CANNON.Vec3(FLIP_LEN / 2, FLIP_H / 2, FLIP_W / 2));
    // shape sits one half-length out from the pivot, along local +x for left / -x for right
    body.addShape(shape, new CANNON.Vec3(-side * FLIP_LEN / 2, 0, 0));
    body.position.set(this.px, FLIP_H / 2 + 0.02, this.pz);
    world.addBody(body);
    this.body = body;
    const g = new THREE.BoxGeometry(FLIP_LEN, FLIP_VH, FLIP_W);
    g.translate(-side * FLIP_LEN / 2, -(FLIP_H - FLIP_VH) / 2, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#e8482f', roughness: 0.35, emissive: '#000000' }));
    this.mesh.castShadow = K.shadows;
    scene.add(this.mesh);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, FLIP_VH + 0.3, 10), railMat);
    post.position.set(this.px, FLIP_VH / 2 + 0.02, this.pz); scene.add(post);
    body.addEventListener('collide', (e) => this.onHit(e));
    this.apply();
  }
  apply() {
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.ang);
    this.body.angularVelocity.set(0, this.omega, 0);
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }
  // world-space direction the paddle points
  dir() { return new THREE.Vector2(-this.side * Math.cos(this.ang), this.side * Math.sin(this.ang)); }
  press(on) {
    const was = this.target;
    this.target = on ? this.up : this.rest;
    if (on && was !== this.up) { this.armed = true; this.mesh.material.emissive.setHex(0x5a1408); click(2.4, 2.0, 0); buzz(7); }
    if (!on) this.mesh.material.emissive.setHex(0x000000);
  }
  step(dt) {
    const d = this.target - this.ang;
    const maxStep = K.flipSpeed * dt;
    const move = clamp(d, -maxStep, maxStep);
    this.omega = move / dt;
    this.ang += move;
    this.apply();
  }
  // swinging toward "up" with real angular speed = a live hit
  get live() { return Math.abs(this.omega) > 3 && this.target === this.up; }
  onHit(e) {
    const other = e.body === this.body ? e.target : e.body;
    if (other !== ball) return;
    const dx = ball.position.x - this.px, dz = ball.position.z - this.pz;
    const r = clamp(Math.hypot(dx, dz) / FLIP_LEN, 0, 1.15);
    if (this.live && this.armed) {
      this.armed = false;                       // one whack per swing — a real flipper hits once
      // the tip's velocity direction: d/da of dir(), times the sign of the sweep
      const s = Math.sign(this.omega);
      const sx = this.side * Math.sin(this.ang) * s;
      const sz = this.side * Math.cos(this.ang) * s;
      const ramp = (1 - K.tipBias) + K.tipBias * r;
      const p = K.flipPower * ramp;
      ball.applyImpulse(new CANNON.Vec3(sx * p, 0, sz * p));
      ball.velocity.z -= p * 0.15;   // a floor of up-table kick so a hit always goes somewhere
      trauma = Math.min(1, trauma + 0.18 + 0.28 * r);
      click(3.5 * ramp, 0.75, 0);
      buzz(r > 0.75 ? [11, 14, 7] : 9);
      flash(this.mesh, 0xff6a3a, 120);
    } else {
      click(Math.abs(e.contact.getImpactVelocityAlongNormal()) * 0.3, 0.9);
    }
  }
}

function flash(mesh, hex, ms) {
  mesh.material.emissive.setHex(hex);
  clearTimeout(mesh.__ft);
  mesh.__ft = setTimeout(() => mesh.material.emissive.setHex(0x000000), ms);
}

class Bumper {
  constructor(x, z) {
    this.x = x; this.z = z;
    this.body = new CANNON.Body({ mass: 0, material: bumpMat });
    this.body.addShape(new CANNON.Cylinder(BUMP_R, BUMP_R, 1.4, 14));
    this.body.position.set(x, 0.7, z);
    world.addBody(this.body);
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(BUMP_R, BUMP_R * 0.92, 1.0, 20),
      new THREE.MeshStandardMaterial({ color: '#2a5f8a', roughness: 0.4, emissive: '#000000' }));
    this.mesh.position.set(x, 0.5, z); this.mesh.castShadow = K.shadows;
    scene.add(this.mesh);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(BUMP_R * 0.62, BUMP_R * 0.62, 0.16, 18),
      new THREE.MeshStandardMaterial({ color: '#f2f7ff', roughness: 0.3 }));
    cap.position.set(x, 1.05, z); scene.add(cap);
    this.body.addEventListener('collide', (e) => {
      const other = e.body === this.body ? e.target : e.body;
      if (other !== ball || waiting) return;
      const dx = ball.position.x - x, dz = ball.position.z - z;
      const l = Math.hypot(dx, dz) || 1;
      ball.applyImpulse(new CANNON.Vec3((dx / l) * K.bumper, 0, (dz / l) * K.bumper));
      flash(this.mesh, 0xffd24a, 160);
      trauma = Math.min(1, trauma + 0.22);
      click(3, 1.5, 0); buzz(12);
      addScore(100);
    });
  }
}

function makeBall() {
  const b = new CANNON.Body({ mass: 1.1, shape: new CANNON.Sphere(BALL_R), material: ballMat });
  b.linearDamping = 0.012; b.angularDamping = 0.2;
  b.ccdSpeedThreshold = 1;
  world.addBody(b);
  const geo = new THREE.IcosahedronGeometry(BALL_R, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.28, metalness: 0.15, flatShading: true }));
  m.castShadow = K.shadows;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x2a1d10 }));
  m.add(edges);
  scene.add(m);
  ball = b; ballMesh = m;
}

// ---------------------------------------------------------------- scene
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('c') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0f16');
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x141c28, 1.0));
  const dir = new THREE.DirectionalLight(0xfff4e2, 1.9);
  dir.position.set(4, 22, 8); dir.castShadow = true; dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -9; dir.shadow.camera.right = 9;
  dir.shadow.camera.top = 14; dir.shadow.camera.bottom = -14;
  scene.add(dir);

  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, K.tilt) });
  world.solver.iterations = 14;
  world.defaultContactMaterial.friction = 0.04;
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, floorMat, { friction: 0.02, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat, { friction: 0.02, restitution: 0.42 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipMat, { friction: 0.14, restitution: 0.22 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumpMat, { friction: 0.02, restitution: 0.55 }));

  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(floor);
  const ceil = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
  ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0); ceil.position.y = 1.0; world.addBody(ceil);

  // the playfield deck + a bit of pattern so motion reads
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 1, BOT - TOP + 1), woodMat);
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, -0.01, (TOP + BOT) / 2);
  deck.receiveShadow = true; scene.add(deck);
  const inlane = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 3.2),
    new THREE.MeshStandardMaterial({ color: '#1d2f4d', roughness: 0.9 }));
  inlane.rotation.x = -Math.PI / 2; inlane.position.set(0, 0.005, PIVOT_Z + 0.8); scene.add(inlane);

  buildWalls();
  for (const [x, z] of BUMPERS) bumps.push(new Bumper(x, z));
  flippers = [new Flipper(-1), new Flipper(1)];
  makeBall();

  plungerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.7),
    new THREE.MeshStandardMaterial({ color: '#ffd24a', roughness: 0.4 }));
  plungerMesh.position.set((LANE_X + HW) / 2, 0.3, BOT - 0.2); scene.add(plungerMesh);

  layout();
  addEventListener('resize', layout);
  resetBall();
  refreshHud();
  requestAnimationFrame(loop);
}

function buildWalls() {
  // top arc
  const N = 9;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI;
    const p = [HW * Math.cos(t), TOP + 3.2 - 3.2 * Math.sin(t)];
    if (prev) wall(prev[0], prev[1], p[0], p[1]);
    prev = p;
  }
  wall(-HW, TOP + 3.0, -HW, 5.1);                 // left outer
  wall(HW, TOP + 3.0, HW, BOT);                   // right outer (also the lane's outer wall)
  wall(LANE_X, LANE_TOP, LANE_X, BOT);            // lane inner wall
  wall(LANE_X, BOT, HW, BOT);                     // lane floor
  wall(-HW, 5.1, -PIVOT_X - 0.35, PIVOT_Z - 0.2); // left kicker into the flipper
  wall(LANE_X, 5.1, PIVOT_X + 0.35, PIVOT_Z - 0.2); // right kicker
  // drain walls below the flippers keep the ball from squirting sideways
  wall(-HW, 5.1, -HW, BOT, 0.34, 1.5);
  wall(-HW, BOT, -1.6, BOT);
  wall(1.6, BOT, LANE_X, BOT);
}

function layout() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, 24, 8.5); camera.lookAt(0, 0, 0.6);
  const cs = [
    new V3(-HW - 0.6, 0, TOP - 0.4), new V3(HW + 0.6, 0, TOP - 0.4),
    new V3(-HW - 0.6, 0, BOT + 0.6), new V3(HW + 0.6, 0, BOT + 0.6),
  ];
  const dv = new V3().subVectors(camera.position, new V3(0, 0, 0.6)).normalize();
  for (let i = 0; i < 120; i++) {
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    let fits = true;
    for (const c of cs) { const p = c.clone().project(camera); if (Math.abs(p.x) > 0.97 || Math.abs(p.y) > 0.93) { fits = false; break; } }
    if (fits) break;
    camera.position.addScaledVector(dv, 0.6); camera.lookAt(0, 0, 0.6);
  }
  camera.updateProjectionMatrix();
  camBase.copy(camera.position);
}

// ---------------------------------------------------------------- the game
function resetBall() {
  waiting = true; pull = 0;
  ball.position.set((LANE_X + HW) / 2, BALL_R + 0.01, BOT - 1.4);
  ball.velocity.set(0, 0, 0); ball.angularVelocity.set(0, 0, 0);
  ball.wakeUp();
  document.getElementById('plunge').classList.toggle('on', !dead);
  syncBall();
}
function launch(power = 1) {
  if (!waiting || dead) return;
  waiting = false;
  document.getElementById('plunge').classList.remove('on');
  ensureAudio();
  ball.velocity.set(0, 0, -K.launch * clamp(power, 0.25, 1));
  click(3, 0.6, 0); buzz(16);
  plungerMesh.position.z = BOT - 0.2;
}
function drain() {
  waiting = true;
  balls--;
  click(2, 0.45, 0); buzz([18, 40, 18]);
  if (balls <= 0) { gameOver(); return; }
  resetBall(); refreshHud();
}
function gameOver() {
  dead = true;
  document.getElementById('plunge').classList.remove('on');
  if (score > best) { best = score; try { localStorage.setItem('table.best', String(best)); } catch (e) {} }
  document.getElementById('overScore').textContent = score;
  document.getElementById('overLine').textContent = `best ${best}`;
  document.getElementById('over').classList.add('show');
  refreshHud();
}
function newGame() {
  score = 0; balls = 3; dead = false;
  document.getElementById('over').classList.remove('show');
  resetBall(); refreshHud();
}
function addScore(n) {
  score += n;
  const p = document.getElementById('pop');
  p.textContent = `+${n}`; p.classList.add('show');
  clearTimeout(p.__t); p.__t = setTimeout(() => p.classList.remove('show'), 260);
  refreshHud();
}
function syncBall() {
  ballMesh.position.copy(ball.position);
  ballMesh.quaternion.copy(ball.quaternion);
}

// ---------------------------------------------------------------- loop
let acc = 0, lastT = 0, fpsN = 0, fpsT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastT) / 1000, 0.08); lastT = t;
  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { document.getElementById('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }

  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n++ < 8) {
    acc -= FIXED_DT;
    for (const f of flippers) f.step(FIXED_DT);
    world.step(FIXED_DT);
    // speed clamp so nothing tunnels out of the box
    const sp = ball.velocity.length();
    if (sp > 40) ball.velocity.scale(40 / sp, ball.velocity);
  }

  // out of bounds rescue + drain
  if (!waiting && !dead) {
    if (ball.position.z > DRAIN_Z + 0.4 && Math.abs(ball.position.x) < LANE_X - 0.2) drain();
    else if (Math.abs(ball.position.x) > HW + 1.5 || ball.position.z < TOP - 2 || ball.position.z > BOT + 2) drain();
  }
  syncBall();
  plungerMesh.position.z = BOT - 0.2 + pull * 0.9;

  if (trauma > 0) {
    noiseT += dt * 46;
    const s = trauma * trauma * 0.75;
    camera.position.set(camBase.x + Math.sin(noiseT * 1.3) * s, camBase.y + Math.sin(noiseT * 1.7 + 1) * s * 0.5, camBase.z + Math.cos(noiseT * 0.9) * s * 0.5);
    trauma = Math.max(0, trauma - dt * 2.6);
    if (trauma === 0) camera.position.copy(camBase);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- UI
function refreshHud() {
  document.getElementById('score').textContent = score;
  document.getElementById('sub').textContent = dead ? `best ${best}` : `ball ${clamp(4 - balls, 1, 3)} of 3 · best ${best}`;
}

function bindUI() {
  const cvs = document.getElementById('c');
  const held = new Map();      // pointerId -> flipper index
  cvs.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (dead) return;
    const i = e.clientX < innerWidth / 2 ? 0 : 1;
    held.set(e.pointerId, i);
    flippers[i].press(true);
    try { cvs.setPointerCapture(e.pointerId); } catch (_) {}   // synthetic pointers have none
  });
  const up = (e) => {
    const i = held.get(e.pointerId);
    if (i === undefined) return;
    held.delete(e.pointerId);
    if (![...held.values()].includes(i)) flippers[i].press(false);
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'z') flippers[0].press(true);
    if (e.key === 'ArrowRight' || e.key === '/') flippers[1].press(true);
    if (e.key === ' ') { ensureAudio(); launch(1); }
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'z') flippers[0].press(false);
    if (e.key === 'ArrowRight' || e.key === '/') flippers[1].press(false);
  });

  // the plunger: pull down, release
  const pl = document.getElementById('plunge');
  let p0 = null;
  pl.addEventListener('pointerdown', (e) => {
    ensureAudio(); p0 = e.clientY; pull = 0;
    try { pl.setPointerCapture(e.pointerId); } catch (_) {}
    e.stopPropagation();
  });
  pl.addEventListener('pointermove', (e) => {
    if (p0 === null) return;
    pull = clamp((e.clientY - p0) / (innerHeight * 0.16), 0, 1);
    if (pull > 0.02) click(0.5, 2.2, 60);
    e.stopPropagation();
  });
  const plUp = (e) => {
    if (p0 === null) return;
    const p = pull; p0 = null; pull = 0;
    launch(p < 0.08 ? 0.62 : 0.3 + p * 0.7);
    e.stopPropagation();
  };
  pl.addEventListener('pointerup', plUp);
  pl.addEventListener('pointercancel', plUp);

  document.getElementById('again').addEventListener('click', newGame);
  const panel = document.getElementById('panel');
  document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
  bindRange('flipPower', 0, 40, 0.5);
  bindRange('flipSpeed', 6, 70, 1);
  bindRange('tipBias', 0, 1, 0.05);
  bindRange('tilt', 2, 18, 0.5, () => world.gravity.set(0, -22, K.tilt));
  bindRange('bumper', 0, 26, 0.5);
  bindRange('launch', 12, 42, 1);
  bindToggle('sound'); bindToggle('haptics');
  bindToggle('shadows', () => {
    renderer.shadowMap.enabled = K.shadows;
    ballMesh.castShadow = K.shadows;
    for (const f of flippers) f.mesh.castShadow = K.shadows;
    for (const b of bumps) b.mesh.castShadow = K.shadows;
  });
}
function bindRange(key, min, max, step, cb) {
  const row = document.querySelector(`[data-range="${key}"]`), input = row.querySelector('input'), out = row.querySelector('.val');
  input.min = min; input.max = max; input.step = step; input.value = K[key]; out.textContent = K[key];
  input.addEventListener('input', () => { K[key] = parseFloat(input.value); out.textContent = input.value; cb && cb(); });
}
function bindToggle(key, cb) {
  const el = document.querySelector(`[data-toggle="${key}"]`);
  el.classList.toggle('sel', K[key]);
  el.addEventListener('click', () => { K[key] = !K[key]; el.classList.toggle('sel', K[key]); cb && cb(); });
}

init();
bindUI();

// ---------------------------------------------------------------- debug handle
// the verb, once: table.flip('left')  — holds the flipper up for `ms` then drops it.
window.table = {
  K,
  flip(side = 'left', ms = 130) {
    const f = flippers[side === 'right' || side === 1 ? 1 : 0];
    f.press(true);
    setTimeout(() => f.press(false), ms);
    return f;
  },
  launch,
  newGame,
  placeBall(x, z, vx = 0, vz = 0) {   // drop the ball onto a flipper to script a hit
    waiting = false;
    document.getElementById('plunge').classList.remove('on');
    ball.position.set(x, BALL_R + 0.01, z);
    ball.velocity.set(vx, 0, vz); ball.angularVelocity.set(0, 0, 0); ball.wakeUp();
  },
  get score() { return score; },
  get balls() { return balls; },
  get best() { return best; },
  get ball() { return ball; },
  get ballPos() { return { x: ball.position.x, z: ball.position.z }; },
  get ballSpeed() { return ball.velocity.length(); },
  get angles() { return flippers.map((f) => f.ang); },
  get flippers() { return flippers; },
};
