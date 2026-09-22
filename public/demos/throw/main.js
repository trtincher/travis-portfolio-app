// the Throw — flick a weapon at a spinning target. One verb: the flick.
// A wooden disc spins at the top of a portrait screen with a couple of blades already in it.
// Flick up: the next War-Band weapon flips end-over-end straight up the screen (2D, z fixed)
// and STICKS in the wood, then turns with it. Hit a blade that is already stuck and it clangs
// off and the round is over. Ten throws per target; the spin changes every target.
// Donors: bowl/round (flick gesture, knob panel, hit-stop + trauma, audio); warband (Synty
// weapon GLBs + the normalise-by-measurement loader); wake (the deflect rule — a bad contact
// is a bounce, not a graze).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------- knobs
const K = {
  speed: 15,       // world units / sec up the screen
  flip: 13,        // rad/sec end-over-end while in flight
  discSpeed: 1.0,  // multiplier on the target's spin
  hitArc: 5,       // HALF-width, degrees, of a stuck blade's footprint on the rim
  hitStop: 5,      // frames frozen on a stick
  shake: 0.35,     // camera trauma on a stick
  sound: true, haptics: true, shadows: true,
};

// ---------------------------------------------------------------- geometry of the board
const DISC_Y = 2.6, DISC_R = 2.3, DISC_Z = 0;
const LAUNCH_Y = -3.85, WEP_Z = 0.34;
const WEP_LEN = 1.2, REACH = WEP_LEN / 2, EMBED = 0.45;
const STICK_R = DISC_R - EMBED + WEP_LEN / 2;   // radius of a stuck weapon's centre
const THROWS = 10, PRESTUCK = 2;
const ORDER = ['axe', 'sword', 'spear', 'hammer'];
const FILES = {
  axe: 'SM_Wep_Axe_01', sword: 'SM_Wep_Sword_01',
  spear: 'SM_Wep_Spear_01', hammer: 'SM_Wep_Hammer_01',
};

// ---------------------------------------------------------------- state
let renderer, scene, camera, disc, protos = {}, ready = false;
let flying = null, held = null, stuck = [], spin = 0.9, hitStopLeft = 0, trauma = 0;
let G = { round: 1, throwIdx: 0, stuckThisRound: 0, total: 0, alive: true };
let best = 0;
try { best = parseInt(localStorage.getItem('throw.best') || '0', 10) || 0; } catch (e) {}
let pending = null;                 // resolver for the promise throwOne() hands back
const camBase = new THREE.Vector3(0, -0.7, 12);
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; return (a < 0 ? a + TAU : a) - Math.PI; };
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- wood
function woodTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#9a6b3d'; g.fillRect(0, 0, S, S);
  for (let r = S / 2; r > 0; r -= 3.2) {
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU);
    g.strokeStyle = `rgba(60,34,14,${0.05 + Math.random() * 0.13})`;
    g.lineWidth = 1 + Math.random() * 2.2; g.stroke();
  }
  for (let i = 0; i < 26; i++) {                     // plank grain
    g.beginPath(); g.moveTo(0, Math.random() * S); g.lineTo(S, Math.random() * S);
    g.strokeStyle = `rgba(48,26,10,${0.04 + Math.random() * 0.06})`; g.lineWidth = 1; g.stroke();
  }
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.09, 0, TAU);
  g.fillStyle = '#c4453a'; g.fill();                 // bullseye, so the spin is readable
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.30, 0, TAU);
  g.strokeStyle = 'rgba(196,69,58,.55)'; g.lineWidth = 4; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- weapons
const atlas = new THREE.TextureLoader().load('./assets/weapons/synty_atlas.png');
atlas.colorSpace = THREE.SRGBColorSpace; atlas.flipY = false;
const wepMat = new THREE.MeshLambertMaterial({ map: atlas, emissive: 0x585858, emissiveMap: atlas });

function normalise(root) {
  root.traverse((n) => { if (n.isMesh) { n.material = wepMat; n.castShadow = true; } });
  const bb = () => new THREE.Box3().setFromObject(root);
  let d = bb().getSize(new THREE.Vector3());
  // Synty ships centimetres through assimp — normalise by measurement, never by trusting units
  if (Math.max(d.x, d.y, d.z) > 10) root.scale.multiplyScalar(0.01);
  d = bb().getSize(new THREE.Vector3());
  root.scale.multiplyScalar(WEP_LEN / Math.max(d.y, 1e-6));
  root.position.sub(bb().getCenter(new THREE.Vector3()));   // long axis centred, +Y is the point
  const holder = new THREE.Group();
  holder.add(root);
  return holder;
}
function fallbackWeapon() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, WEP_LEN * 0.55, 0.03), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }));
  blade.position.y = WEP_LEN * 0.22;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, WEP_LEN * 0.45, 0.08), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  grip.position.y = -WEP_LEN * 0.27;
  g.add(blade, grip);
  const holder = new THREE.Group(); holder.add(g); return holder;
}
async function loadWeapons() {
  // the Synty GLBs still name an external `..\_working\Texture_01.png`; point every non-glb
  // request at the atlas we copied in so the loader never 404s (the material is replaced anyway)
  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier((url) => (/\.glb(\?|$)/i.test(url) ? url : './assets/weapons/synty_atlas.png'));
  const loader = new GLTFLoader(mgr);
  await Promise.all(ORDER.map((id) => new Promise((res) => {
    loader.load(`./assets/weapons/${FILES[id]}.glb`,
      (gltf) => { try { protos[id] = normalise(gltf.scene); } catch (e) { protos[id] = fallbackWeapon(); } res(); },
      undefined,
      () => { protos[id] = fallbackWeapon(); res(); });
  })));
}
const makeWeapon = (id) => (protos[id] || fallbackWeapon()).clone(true);

// ---------------------------------------------------------------- audio + juice
let audioCtx = null, noiseBuf = null;
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
function thunk() {                                   // the stick: wood, low, short
  if (K.haptics && navigator.vibrate) navigator.vibrate([14, 18, 9]);
  if (!K.sound || !audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.11);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.18);
  const s = audioCtx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.55;
  const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 1.1;
  const ng = audioCtx.createGain(); ng.gain.value = 0.34;
  s.connect(bp).connect(ng).connect(audioCtx.destination); s.start(t);
}
function clang() {                                   // the bounce: metal, bright, ugly
  if (K.haptics && navigator.vibrate) navigator.vibrate([40, 30, 60]);
  if (!K.sound || !audioCtx) return;
  const t = audioCtx.currentTime;
  for (const f of [1180, 1637, 2490]) {
    const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * rand(0.98, 1.02);
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.72);
  }
}

// ---------------------------------------------------------------- scene
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('c') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = K.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16110d);
  scene.fog = null;
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.copy(camBase);

  scene.add(new THREE.HemisphereLight(0xffe6c4, 0x2a1d12, 1.05));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.35);
  key.position.set(3.5, 6, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const cam = key.shadow.camera;
  cam.left = -7; cam.right = 7; cam.top = 9; cam.bottom = -9; cam.near = 1; cam.far = 24;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.4); rim.position.set(-5, -2, 4); scene.add(rim);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x241a13 }));
  wall.position.z = -2.2; wall.receiveShadow = true; scene.add(wall);

  disc = new THREE.Group();
  disc.position.set(0, DISC_Y, DISC_Z);
  scene.add(disc);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R, DISC_R, 0.34, 48), new THREE.MeshLambertMaterial({ map: woodTexture() }));
  face.rotation.x = Math.PI / 2;   // lie the cylinder face-on to the camera
  face.receiveShadow = true;
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(DISC_R, 0.1, 8, 48), new THREE.MeshLambertMaterial({ color: 0x4d3118 }));
  rimRing.position.z = 0.02;
  // the face texture is mapped on the cylinder cap, which three lays out in the XZ plane —
  // after the rotation the art turns with the disc, which is the whole point.
  disc.add(face, rimRing);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 6, 0.34), new THREE.MeshLambertMaterial({ color: 0x3a2a1b }));
  post.position.set(0, DISC_Y - 3.6, -0.55); scene.add(post);

  addEventListener('resize', resize);
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  // fit the height, but never let a narrow phone clip the disc
  const viewH = Math.max(11, 5.9 / Math.max(aspect, 0.2));
  camera.fov = 2 * Math.atan((viewH / 2) / camBase.z) * 180 / Math.PI;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- the round
function seatWeapon(node, theta) {
  node.position.set(Math.cos(theta) * STICK_R, Math.sin(theta) * STICK_R, WEP_Z);
  node.rotation.z = theta + Math.PI / 2;    // local +Y (the point) faces the centre
  return node;
}
function setHeld() {                                 // the next weapon waits in the lane, point up
  if (held) { scene.remove(held); held = null; }
  if (!G.alive) return;
  const node = makeWeapon(nextWeaponId());
  node.traverse((n) => { if (n.isMesh) n.castShadow = K.shadows; });
  node.position.set(0, LAUNCH_Y, WEP_Z);
  scene.add(node);
  held = node;
}
function newRound() {
  if (flying) { scene.remove(flying.node); flying = null; }   // a mid-clang weapon must not survive the reset
  for (const s of stuck) disc.remove(s.node);
  stuck = [];
  disc.rotation.z = 0;
  spin = rand(0.75, 1.5) * (1 + (G.round - 1) * 0.11) * (Math.random() < 0.5 ? 1 : -1);
  for (let i = 0; i < PRESTUCK; i++) {
    const theta = rand(0, TAU);
    const node = seatWeapon(makeWeapon(ORDER[(Math.random() * ORDER.length) | 0]), theta);
    node.traverse((n) => { if (n.isMesh) n.castShadow = K.shadows; });
    disc.add(node);
    stuck.push({ node, theta });
  }
  G.throwIdx = 0; G.stuckThisRound = 0;
  flying = null; ready = true;
  setHeld();
  hud();
}
function newGame() {
  G = { round: 1, throwIdx: 0, stuckThisRound: 0, total: 0, alive: true };
  $('over').classList.remove('show');
  newRound();
}
function nextWeaponId() { return ORDER[(G.throwIdx + (G.round - 1)) % ORDER.length]; }

function throwOne() {
  if (!ready || flying || !G.alive) return Promise.resolve(null);
  ensureAudio();
  const id = nextWeaponId();
  if (!held) setHeld();
  const node = held; held = null;
  node.position.set(0, LAUNCH_Y, WEP_Z);
  flying = { node, y: LAUNCH_Y, rot: 0, id, dead: false, vx: 0, vy: 0 };
  ready = false;
  hud();
  return new Promise((res) => { pending = res; });
}
function settle(outcome) {
  const r = pending; pending = null;
  if (r) r(outcome);
}

function onStick() {
  const worldContact = -Math.PI / 2;                 // the disc's lowest point, where flight meets wood
  const theta = wrap(worldContact - disc.rotation.z);
  scene.remove(flying.node);
  const node = seatWeapon(flying.node, theta);
  disc.add(node);
  stuck.push({ node, theta });
  flying = null;
  hitStopLeft = K.hitStop;
  trauma = Math.min(1, trauma + K.shake);
  thunk();
  G.total++; G.stuckThisRound++; G.throwIdx++;
  if (G.total > best) { best = G.total; try { localStorage.setItem('throw.best', String(best)); } catch (e) {} }
  const sc = $('score'); sc.classList.remove('pop'); void sc.offsetWidth; sc.classList.add('pop');
  settle('stuck');
  if (G.throwIdx >= THROWS) { ready = false; G.round++; setTimeout(() => { if (G.alive) newRound(); }, 620); }
  else { ready = true; setHeld(); }
  hud();
}
function onClang() {
  flying.dead = true;
  flying.vx = (Math.random() < 0.5 ? -1 : 1) * rand(3.2, 5.4);
  flying.vy = rand(1.5, 3.2);
  trauma = Math.min(1, trauma + 0.8);
  hitStopLeft = K.hitStop + 4;
  clang();
  G.alive = false; ready = false;
  settle('clang');
  setTimeout(gameOver, 780);
}
function gameOver() {
  if (G.alive) return;            // a restart beat the 780ms beat — do not stamp the fresh game
  $('overTotal').textContent = G.total;
  $('overLine').textContent = `${G.round === 1 ? 'first target' : `target ${G.round}`} · ${G.stuckThisRound} of ${THROWS} in the wood`;
  $('overBest').textContent = `best ${best}`;
  $('over').classList.add('show');
}

function hud() {
  const mag = Math.abs(spin) * K.discSpeed;
  $('roundno').textContent = `target ${G.round}`;
  $('spinlbl').textContent = `${mag < 1.05 ? 'slow' : mag < 1.7 ? 'brisk' : 'fast'} ${spin > 0 ? '↺' : '↻'}`;
  $('throwno').textContent = `throw ${Math.min(G.throwIdx + 1, THROWS)} of ${THROWS}`;
  $('score').textContent = G.total;
  $('stuck').textContent = `stuck ${G.stuckThisRound}/${THROWS}`;
  $('wep').textContent = ready || flying ? nextWeaponId() : '—';
  $('best').textContent = `best ${best}`;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05); last = now;

  if (hitStopLeft > 0) { hitStopLeft--; dt = 0; }     // the beat

  disc.rotation.z += spin * K.discSpeed * dt;

  if (flying) {
    if (flying.dead) {
      flying.y += flying.vy * dt; flying.vy -= 14 * dt;
      flying.node.position.x += flying.vx * dt;
      flying.node.position.y = flying.y;
      flying.rot += K.flip * 1.7 * dt;
      flying.node.rotation.z = flying.rot;
      if (flying.y < -9) { scene.remove(flying.node); flying = null; }
    } else {
      flying.y += K.speed * dt;
      flying.rot -= K.flip * dt;
      flying.node.position.y = flying.y;
      flying.node.rotation.z = flying.rot;
      if (flying.y + REACH >= DISC_Y - DISC_R) {
        const worldContact = -Math.PI / 2;
        const arc = K.hitArc * Math.PI / 180;
        let blocked = false;
        for (const s of stuck) {
          if (Math.abs(wrap(s.theta + disc.rotation.z - worldContact)) < arc) { blocked = true; break; }
        }
        if (blocked) onClang(); else onStick();
      }
    }
  }

  if (held) {                                        // idle breath on the weapon in hand
    held.position.y = LAUNCH_Y + Math.sin(now / 380) * 0.07;
    held.rotation.z = Math.sin(now / 640) * 0.09;
  }

  trauma = Math.max(0, trauma - dt * 2.2);
  const t2 = trauma * trauma;
  camera.position.set(camBase.x + (Math.random() - 0.5) * t2 * 0.55,
                      camBase.y + (Math.random() - 0.5) * t2 * 0.55, camBase.z);
  camera.lookAt(0, camBase.y + 0.7, 0);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- input + knobs
function bindUI() {
  const cvs = $('c');
  let p0 = null, samples = [];
  const down = (e) => { p0 = { x: e.clientX, y: e.clientY, t: performance.now() }; samples = [p0]; ensureAudio(); };
  const move = (e) => { if (!p0) return; samples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (samples.length > 6) samples.shift(); };
  const up = (e) => {
    if (!p0) return;
    const ref = samples[0], end = { x: e.clientX, y: e.clientY, t: performance.now() };
    const dt = Math.max(end.t - ref.t, 1);
    const vy = (end.y - ref.y) / dt, vx = (end.x - ref.x) / dt;
    const sp = Math.hypot(vx, vy);
    const tapped = sp < 0.18 && Math.hypot(end.x - p0.x, end.y - p0.y) < 14;
    p0 = null;
    if (!G.alive) return;
    if (tapped || (vy < 0 && sp >= 0.18)) throwOne();   // a flick up, or a plain tap
  };
  cvs.addEventListener('pointerdown', down);
  cvs.addEventListener('pointermove', move);
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', () => { p0 = null; });

  $('again').addEventListener('click', () => newGame());
  const panel = $('panel');
  $('gear').addEventListener('click', () => panel.classList.toggle('open'));
  bindRange('speed', 6, 30, 0.5);
  bindRange('flip', 0, 30, 0.5);
  bindRange('discSpeed', 0.2, 2.5, 0.05, hud);
  bindRange('hitArc', 2, 20, 0.5);
  bindRange('hitStop', 0, 14, 1);
  bindRange('shake', 0, 1, 0.05);
  bindToggle('sound'); bindToggle('haptics');
  bindToggle('shadows', () => {
    renderer.shadowMap.enabled = K.shadows;
    scene.traverse((n) => { if (n.isMesh && n.parent !== scene) n.castShadow = K.shadows; });
  });
}
function bindRange(key, min, max, step, cb) {
  const row = document.querySelector(`[data-range="${key}"]`), input = row.querySelector('input'), out = row.querySelector('.val');
  input.min = min; input.max = max; input.step = step; input.value = K[key]; out.textContent = K[key];
  input.addEventListener('input', () => { K[key] = parseFloat(input.value); out.textContent = input.value; if (cb) cb(); });
}
function bindToggle(key, cb) {
  const el = document.querySelector(`[data-toggle="${key}"]`);
  el.classList.toggle('sel', K[key]);
  el.addEventListener('click', () => { K[key] = !K[key]; el.classList.toggle('sel', K[key]); if (cb) cb(); });
}

// ---------------------------------------------------------------- boot
init();
bindUI();
requestAnimationFrame(frame);
$('hint').textContent = 'loading the rack…';
loadWeapons().then(() => {
  newGame();
  $('hint').textContent = "flick up to throw · stick it in the wood · hit a stuck blade and you're done";
});

window.throw = {
  K,
  throwOne,                                   // resolves 'stuck' | 'clang' | null
  newGame,
  get G() { return G; },
  get ready() { return ready; },
  get stuck() { return stuck.map((s) => s.theta); },
  get spin() { return spin * K.discSpeed; },
  get discAngle() { return disc.rotation.z; },
  get best() { return best; },
};
