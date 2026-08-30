/* ============================================================
   BASKETBALL ARENA - ARCADE
   ------------------------------------------------------------
   An extended, polished version of the original Three.js +
   Cannon.js basketball game. All original mechanics preserved:
     - Three.js rendering
     - Cannon.js physics
     - Drag to shoot
     - Orbit camera
     - Physics basketball
     - Realistic rim collision
     - Dynamic net
     - Score system
     - Timer
     - Praise animation
     - Ball spawning
   New systems: combos, bonuses, game modes, particles, audio,
   arena environment, trajectory guide, stats, leaderboards.
   ============================================================ */

// ============================================================
// CONFIG
// ============================================================
const HOOP_POS = { x: 0, y: 12.0, z: 5.0 };
const RING_RADIUS = 0.75;
const BALL_RADIUS = 0.5;
const GRAVITY = -20;
const PRAISE_PHRASES = ["Perfect!", "Swish!", "On Fire!", "Master!", "Bucket!", "Clean!", "Wow!"];
const LONG_SHOT_DIST = 9.5;
const FAST_SHOT_MS = 4000;
const TIME_ATTACK_BONUS = 5;

// Game mode definitions
const MODES = {
  practice:  { name: "PRACTICE",    time: 0,   hoopMove: false, ringScale: 1.00, aimGuide: true,  trickOnly: false, desc: "Free shooting" },
  arcade:    { name: "ARCADE",      time: 60,  hoopMove: false, ringScale: 1.00, aimGuide: true,  trickOnly: false, desc: "60 seconds" },
  timeattack:{ name: "TIME ATTACK", time: 60,  hoopMove: false, ringScale: 1.00, aimGuide: true,  trickOnly: false, desc: "+5s per basket" },
  moving:    { name: "MOVING HOOP", time: 60,  hoopMove: true,  ringScale: 1.00, aimGuide: true,  trickOnly: false, desc: "Moving target" },
  trickshot: { name: "TRICK SHOT",  time: 0,   hoopMove: false, ringScale: 1.00, aimGuide: true,  trickOnly: true,  desc: "Swishes & banks only" },
  challenge: { name: "CHALLENGE",   time: 30,  hoopMove: true,  ringScale: 0.92, aimGuide: true,  trickOnly: false, desc: "10 objectives" },
  hard:      { name: "HARD MODE",   time: 45,  hoopMove: true,  ringScale: 0.82, aimGuide: false, trickOnly: false, desc: "Small ring, no guide" },
};

// Challenge objectives (used by CHALLENGE mode)
const CHALLENGES = [
  { type: "make",    target: 4, label: "Score 4 baskets" },
  { type: "streak",  target: 3, label: "Reach a x3 combo" },
  { type: "perfect", target: 1, label: "Get a PERFECT swish" },
  { type: "bank",    target: 1, label: "Make a BANK shot" },
  { type: "fire",    target: 1, label: "Reach FIRE MODE" },
  { type: "long",    target: 3, label: "Sink 3 long-range shots" },
  { type: "make",    target: 6, label: "Score 6 baskets" },
  { type: "streak",  target: 5, label: "Reach a x5 combo" },
  { type: "perfect", target: 3, label: "Get 3 PERFECT swishes" },
  { type: "make",    target: 9, label: "Score 9 baskets" },
];

// Basketball skins (procedurally drawn, no external assets)
const SKINS = [
  { id: "classic",  name: "Classic",  base: "#e07b39", dark: "#c05f24", highlight: "#f5a34c", accent: "#ffd9a8", seam: "rgba(40,20,10,0.95)", pattern: "seams" },
  { id: "sunset",   name: "Sunset",   base: "#ff5e3a", dark: "#b0230a", highlight: "#ffb45e", accent: "#ffd23f", seam: "rgba(90,20,5,0.95)",  pattern: "flame" },
  { id: "gold",     name: "Gold",     base: "#f0b429", dark: "#a97408", highlight: "#ffe08a", accent: "#fff3c4", seam: "rgba(120,70,0,0.9)", pattern: "star" },
  { id: "ocean",    name: "Ocean",    base: "#2f9bff", dark: "#0a3d6e", highlight: "#7fd0ff", accent: "#c4e9ff", seam: "rgba(5,40,80,0.95)",  pattern: "rings" },
  { id: "venom",    name: "Venom",    base: "#35c95f", dark: "#0c5c26", highlight: "#a4ffbe", accent: "#c9ffdb", seam: "rgba(5,70,30,0.9)",   pattern: "stripes" },
  { id: "midnight", name: "Midnight", base: "#5a5a8f", dark: "#1a1a3a", highlight: "#c9c9ff", accent: "#9fe8ff", seam: "rgba(20,20,60,0.95)", pattern: "galaxy" },
];

function getSkin() {
  return SKINS.find((s) => s.id === settings.ballSkin) || SKINS[0];
}

// ============================================================
// STATE
// ============================================================
const state = {
  screen: "menu",            // menu | countdown | playing | paused | gameover
  mode: "arcade",
  score: 0,
  streak: 0,                 // consecutive makes
  bestStreak: 0,
  fire: false,
  fireTimes: 0,
  shots: 0,
  makes: 0,
  misses: 0,
  perfects: 0,
  banks: 0,
  longshots: 0,
  fastshots: 0,
  elapsed: 0,                // count-up modes (seconds)
  timeLeft: 60,
  slow: 1,                   // current time scale
  slowTarget: 1,
  shake: 0,
  hoopX: 0,
  zoomTimer: null,
  cameraAnim: false,
  lastScoreAt: 0,
  challengeIndex: 0,
  chStats: { make: 0, perfect: 0, bank: 0, fire: 0, long: 0 },
  resetTimerId: null,
  lastRimAt: 0,
  lastBoardAt: 0,
  lastBounceAt: 0,
};

// ============================================================
// SETTINGS (localStorage)
// ============================================================
const settings = {
  sfxOn: true,
  musicOn: true,
  bloomOn: false,
  aimGuide: true,
  ballSkin: "classic",
};

const HS_KEY = "basketball_arena_highscores_v1";
const SET_KEY = "basketball_arena_settings_v2";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}

function saveSettings() {
  try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveHighScores(scores) {
  try { localStorage.setItem(HS_KEY, JSON.stringify(scores)); } catch (e) { /* ignore */ }
}

// ============================================================
// GLOBAL THREE / CANNON OBJECTS
// ============================================================
let scene, camera, renderer, controls, world, composer, bloomPass;
let currentBall = null;
const activeBalls = [];

// Hoop group (mesh + physics)
const hoop = {
  group: null,
  radius: RING_RADIUS,
  ringMesh: null,
  ringGlow: null,
  ringFlash: 0,
  boardMesh: null,
  ringBodies: [],
  boardBody: null,
  netBodies: [],
  netConstraints: [],
  netMesh: null,
  netGeo: null,
  netCols: 14,
  netRows: 6,
  light: null,
  lightFlash: 0,
};

// Aim line + trajectory
let aimLine;
let trajPoints;
const RAY = new THREE.Raycaster();
const V2 = new THREE.Vector2();

// Camera animation targets
const cameraTargetPos = new THREE.Vector3();
const controlsTargetPos = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const _idMat = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

let lastFrameTime = 0;
let scoreboardDirtyAt = 0;
let glowTexture = null;
let ballTexture = null;
let ballMaterial = null;

// ============================================================
// AUDIO SYSTEM (Web Audio API - synthesized)
// ============================================================
const AudioSys = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  noiseBuf: null,
  musicActive: false,
  musicTimer: null,
  musicStep: 0,
  musicNextT: 0,

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = settings.sfxOn ? 0.85 : 0;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = settings.musicOn ? 0.28 : 0;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  },

  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  applyGains() {
    if (!this.ctx) return;
    this.sfxGain.gain.value = settings.sfxOn ? 0.85 : 0;
    this.musicGain.gain.value = settings.musicOn ? 0.28 : 0;
  },

  // Generic helpers
  tone(f, f2, t, dur, type, vol, dest) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noise(t, dur, vol, ftype, freq, q, dest) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = ftype || "bandpass";
    f.frequency.value = freq || 2000;
    f.Q.value = q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  },

  now() { return this.ctx ? this.ctx.currentTime : 0; },

  // ----- Sounds -----
  swish() {
    const t = this.now();
    this.noise(t, 0.22, 0.5, "bandpass", 3600, 1.2);
    this.tone(900, 1500, t, 0.14, "sine", 0.12);
  },
  rim() {
    const t = this.now();
    this.tone(520, 500, t, 0.09, "sine", 0.2);
    this.tone(780, 760, t, 0.08, "sine", 0.14);
    this.tone(1040, 1000, t, 0.07, "sine", 0.1);
    this.noise(t, 0.05, 0.12, "highpass", 4000, 1);
  },
  board() {
    const t = this.now();
    this.tone(180, 90, t, 0.14, "sine", 0.25);
    this.noise(t, 0.08, 0.16, "lowpass", 600, 1);
  },
  bounce(v) {
    const t = this.now();
    const vol = Math.min(0.5, 0.12 + v * 0.4);
    this.tone(120, 45, t, 0.12, "sine", vol);
    this.noise(t, 0.05, vol * 0.6, "lowpass", 300, 1);
  },
  miss() {
    const t = this.now();
    this.tone(300, 120, t, 0.25, "sawtooth", 0.1);
    this.noise(t, 0.2, 0.12, "bandpass", 500, 2);
  },
  cheer() {
    const t = this.now();
    this.noise(t, 1.1, 0.22, "bandpass", 850, 0.7);
    this.noise(t + 0.25, 0.8, 0.16, "bandpass", 1200, 0.8);
  },
  countBeep() {
    const t = this.now();
    this.tone(700, 700, t, 0.12, "square", 0.16);
  },
  go() {
    const t = this.now();
    this.tone(880, 880, t, 0.5, "square", 0.2);
  },
  combo(level) {
    const t = this.now();
    const notes = [523, 659, 784, 1047, 1319];
    const n = Math.min(level, notes.length - 1);
    for (let i = 0; i <= n; i++) {
      this.tone(notes[i], notes[i], t + i * 0.06, 0.12, "triangle", 0.22);
    }
  },
  perfect() {
    const t = this.now();
    [659, 831, 988, 1319].forEach((f, i) => this.tone(f, f, t + i * 0.08, 0.2, "sine", 0.22));
  },
  fire() {
    const t = this.now();
    this.tone(110, 110, t, 0.5, "sawtooth", 0.22);
    this.tone(165, 165, t, 0.5, "sawtooth", 0.18);
    this.noise(t, 0.6, 0.2, "bandpass", 400, 0.6);
    this.cheer();
  },
  buzzer() {
    const t = this.now();
    this.tone(220, 220, t, 0.9, "sawtooth", 0.25);
  },
  click() {
    const t = this.now();
    this.tone(1200, 900, t, 0.05, "square", 0.1);
  },
  challengeClear() {
    const t = this.now();
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, t + i * 0.07, 0.18, "triangle", 0.2));
  },

  // ----- Music -----
  startMusic() {
    if (!this.ensure() || this.musicActive || !settings.musicOn) return;
    if (this.ctx.state !== "running") return;
    this.musicActive = true;
    this.musicStep = 0;
    this.musicNextT = this.ctx.currentTime + 0.1;
    const self = this;
    this.musicTimer = setInterval(() => self.scheduleMusic(), 60);
  },

  stopMusic() {
    this.musicActive = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },

  scheduleMusic() {
    if (!this.musicActive || !this.ctx) return;
    const bar = 60 / 92; // 8th note duration at 92bpm
    while (this.musicNextT < this.ctx.currentTime + 0.2) {
      const step = this.musicStep;
      const t = this.musicNextT;
      const chord = Math.floor(step / 4) % 4;
      const roots = [110, 87.31, 130.81, 98.0]; // A2 F2 C3 G2
      const pads = [[220, 261.6], [174.6, 220], [261.6, 329.6], [196, 246.9]];
      const base = roots[chord];
      if (step % 4 === 0) {
        this.tone(base, base, t, bar * 3.6, "triangle", 0.2, this.musicGain);
        this.tone(pads[chord][0], pads[chord][0], t, bar * 3.6, "sine", 0.11, this.musicGain);
        this.tone(pads[chord][1], pads[chord][1], t, bar * 3.6, "sine", 0.09, this.musicGain);
      } else if (step % 2 === 1) {
        this.tone(base * 2, base * 2, t, bar * 0.9, "triangle", 0.1, this.musicGain);
      }
      if (step % 2 === 0) {
        this.noise(t, 0.03, 0.04, "highpass", 8000, 1, this.musicGain);
      }
      this.musicStep = (step + 1) % 16;
      this.musicNextT += bar;
    }
  },
};

// ============================================================
// PARTICLE / FX SYSTEM
// ============================================================
class ParticlePool {
  constructor(count, geometry, material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.count = count;
    this.parts = [];
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.parts.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.2,
        grav: 0,
        drag: 0,
        r0: 0, r1: 0, r2: 0,
        rs0: 0, rs1: 0, rs2: 0,
        color: new THREE.Color(0xffffff),
      });
      this.mesh.setMatrixAt(i, _idMat);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  spawn(p) {
    const r = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % this.count;
    r.pos.copy(p.pos);
    r.vel.copy(p.vel);
    r.life = p.life || 0.6;
    r.maxLife = r.life;
    r.size = p.size || 0.2;
    r.grav = p.grav || 0;
    r.drag = p.drag || 0;
    r.color.copy(p.color || new THREE.Color(0xffffff));
    r.r0 = Math.random() * Math.PI * 2;
    r.r1 = Math.random() * Math.PI * 2;
    r.r2 = Math.random() * Math.PI * 2;
    r.rs0 = (Math.random() - 0.5) * 12;
    r.rs1 = (Math.random() - 0.5) * 12;
    r.rs2 = (Math.random() - 0.5) * 12;
    r.alive = true;
    return r;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const r = this.parts[i];
      if (!r.alive) continue;
      r.life -= dt;
      if (r.life <= 0) { r.alive = false; continue; }
      r.vel.y += r.grav * dt;
      r.vel.multiplyScalar(1 - r.drag * dt);
      r.pos.addScaledVector(r.vel, dt);
      r.r0 += r.rs0 * dt; r.r1 += r.rs1 * dt; r.r2 += r.rs2 * dt;
      this.dummy.position.copy(r.pos);
      const s = Math.max(0.0001, r.size * (r.life / r.maxLife));
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(r.r0, r.r1, r.r2);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.color.copy(r.color).multiplyScalar(Math.max(0, r.life / r.maxLife));
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

let sparksPool, confettiPool, firePool, trailPool;

function initParticles() {
  sparksPool = new ParticlePool(320, new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  sparksPool.mesh.material.blending = THREE.AdditiveBlending;
  confettiPool = new ParticlePool(240, new THREE.BoxGeometry(0.13, 0.07, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  firePool = new ParticlePool(220, new THREE.SphereGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  firePool.mesh.material.blending = THREE.AdditiveBlending;
  trailPool = new ParticlePool(160, new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  trailPool.mesh.material.blending = THREE.AdditiveBlending;
}

const SPARK_COLORS = [0xffd27a, 0xff9a3d, 0xff5e00, 0xffffff, 0xffc46b];
const CONFETTI_COLORS = [0xff5252, 0x00e5ff, 0xffd700, 0x69f0ae, 0xb388ff, 0xff8a65, 0xffffff];

function burstSparks(pos, count, colors, speed) {
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
    const sp = (speed || 8) * (0.4 + Math.random() * 0.8);
    sparksPool.spawn({
      pos, vel: dir.multiplyScalar(sp),
      life: 0.4 + Math.random() * 0.5,
      size: 0.16 + Math.random() * 0.14,
      grav: -6, drag: 0.8,
      color: new THREE.Color(colors[(Math.random() * colors.length) | 0]),
    });
  }
}

function burstConfetti(pos, count) {
  for (let i = 0; i < count; i++) {
    confettiPool.spawn({
      pos: pos ? pos.clone() : new THREE.Vector3(HOOP_POS.x, HOOP_POS.y + 2, HOOP_POS.z),
      vel: new THREE.Vector3((Math.random() - 0.5) * 10, 8 + Math.random() * 8, (Math.random() - 0.5) * 10),
      life: 1.4 + Math.random() * 0.9,
      size: 1,
      grav: -6, drag: 1.6,
      color: new THREE.Color(CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]),
    });
  }
}

function spawnFire(pos, count) {
  for (let i = 0; i < count; i++) {
    firePool.spawn({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4)),
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 1.4),
      life: 0.4 + Math.random() * 0.5,
      size: 0.22 + Math.random() * 0.2,
      grav: 1.5, drag: 1.4,
      color: new THREE.Color(Math.random() > 0.5 ? 0xff6a00 : 0xffb347),
    });
  }
}

function spawnTrail(pos) {
  trailPool.spawn({
    pos,
    vel: new THREE.Vector3(0, 0, 0),
    life: 0.32,
    size: 0.2,
    grav: 0, drag: 0,
    color: new THREE.Color(0x66c8ff),
  });
}

function spawnFireTrail(pos) {
  trailPool.spawn({
    pos,
    vel: new THREE.Vector3(0, 0.5, 0),
    life: 0.4,
    size: 0.3,
    grav: 0, drag: 0,
    color: new THREE.Color(0xff7a18),
  });
}

// Camera shake
function addShake(amount) {
  if (REDUCED_MOTION) return;
  state.shake = Math.min(1.2, state.shake + amount);
}

// Screen flash
function flashScreen() {
  const el = document.getElementById("flash");
  el.classList.add("active");
  clearTimeout(flashScreen._t);
  flashScreen._t = setTimeout(() => el.classList.remove("active"), 120);
}

// Screen pulse glow
function pulseScreen() {
  const el = document.getElementById("pulse-glow");
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
}

// Floating text (world -> screen)
function spawnFloatText(text, cls, worldPos, sub) {
  const layer = document.getElementById("float-layer");
  tempVec.copy(worldPos);
  tempVec.project(camera);
  const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tempVec.y * 0.5 + 0.5) * window.innerHeight;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;
  const el = document.createElement("div");
  el.className = "float-text " + (cls || "orange");
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.innerHTML = '<span class="ft-main">' + text + "</span>" +
    (sub ? '<span class="ft-sub">' + sub + "</span>" : "");
  layer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ============================================================
// CANVAS TEXTURES
// ============================================================
function drawSeams(g, seam) {
  g.strokeStyle = seam;
  g.lineWidth = 9;
  // equator
  g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  // two meridian curves
  g.beginPath();
  g.moveTo(256, 0); g.bezierCurveTo(150, 128, 150, 384, 256, 512); g.stroke();
  g.beginPath();
  g.moveTo(256, 0); g.bezierCurveTo(362, 128, 362, 384, 256, 512); g.stroke();
  // side seam arcs
  g.lineWidth = 6;
  g.beginPath(); g.arc(256, 256, 200, -0.55, 0.55); g.stroke();
  g.beginPath(); g.arc(256, 256, 200, Math.PI - 0.55, Math.PI + 0.55); g.stroke();
}

function drawStarShape(cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  const p = new Path2D();
  p.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerR;
    let y = cy + Math.sin(rot) * outerR;
    p.lineTo(x, y);
    rot += step;
    x = cx + Math.cos(rot) * innerR;
    y = cy + Math.sin(rot) * innerR;
    p.lineTo(x, y);
    rot += step;
  }
  p.closePath();
  return p;
}

function makeBallTexture(skin) {
  const s = skin || SKINS[0];
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(200, 190, 40, 256, 256, 330);
  grad.addColorStop(0, s.highlight);
  grad.addColorStop(0.55, s.base);
  grad.addColorStop(1, s.dark);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);

  if (s.pattern === "galaxy") {
    for (let i = 0; i < 130; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 210;
      g.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.7).toFixed(2) + ")";
      const rs = Math.random() * 2.5 + 0.5;
      g.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, rs, rs);
    }
  } else if (s.pattern === "flame") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = 256 + Math.cos(a) * 140;
      const y = 256 + Math.sin(a) * 140;
      const gr = g.createRadialGradient(x, y, 2, x, y, 62);
      gr.addColorStop(0, s.accent);
      gr.addColorStop(1, "rgba(255,61,0,0)");
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, 62, 0, Math.PI * 2); g.fill();
    }
  } else if (s.pattern === "rings") {
    for (let r = 46; r < 262; r += 34) {
      g.strokeStyle = s.accent;
      g.lineWidth = 6;
      g.globalAlpha = 0.6;
      g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  } else if (s.pattern === "star") {
    g.fillStyle = s.accent;
    g.globalAlpha = 0.9;
    g.fill(drawStarShape(256, 256, 5, 150, 62));
    g.globalAlpha = 1;
  } else if (s.pattern === "stripes") {
    const w = 58;
    for (let i = -8; i < 9; i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
      g.beginPath();
      g.moveTo(i * w, 0); g.lineTo((i + 1) * w, 0);
      g.lineTo(i * w, 512); g.lineTo((i - 1) * w, 512);
      g.closePath(); g.fill();
    }
  }

  drawSeams(g, s.seam);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function applyBallSkin() {
  ballTexture = makeBallTexture(getSkin());
  if (ballMaterial) {
    ballMaterial.map = ballTexture;
    ballMaterial.needsUpdate = true;
  }
}

function drawSkinPreview(cv, skin) {
  const g = cv.getContext("2d");
  const cx = cv.width / 2, cy = cv.height / 2, R = 44;
  g.clearRect(0, 0, cv.width, cv.height);
  const grad = g.createRadialGradient(cx - 10, cy - 10, 6, cx, cy, R);
  grad.addColorStop(0, skin.highlight);
  grad.addColorStop(0.6, skin.base);
  grad.addColorStop(1, skin.dark);
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = skin.seam;
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.6, -0.6, 0.6); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.6, Math.PI - 0.6, Math.PI + 0.6); g.stroke();
}

function makeWoodFloorTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#b46a32";
  g.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y += 128) {
    const alt = (y / 128) % 2;
    g.fillStyle = alt ? "#a8602b" : "#b46a32";
    g.fillRect(0, y, 1024, 128);
    // plank seams
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, y, 1024, 3);
    // vertical seams
    for (let x = 64; x < 1024; x += 128) {
      if (Math.random() > 0.2) g.fillRect(x, y, 3, 128);
    }
    // grain
    g.strokeStyle = "rgba(80,40,10,0.15)";
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.moveTo(0, y + 20 + Math.random() * 100);
      g.lineTo(1024, y + 10 + Math.random() * 110);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = 4;
  return tex;
}

function makeCourtTexture() {
  const W = 512, H = 384;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 4;
  // court bounds
  g.strokeRect(10, 10, W - 20, H - 20);
  // half court line + center circle
  g.beginPath(); g.moveTo(10, H / 2); g.lineTo(W - 10, H / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 34, 0, Math.PI * 2); g.stroke();
  // 3pt arc near top (hoop side at bottom in texture -> we flip)
  g.beginPath(); g.arc(W / 2, H - 24, 110, Math.PI * 0.86, Math.PI * 1.14); g.stroke();
  g.beginPath(); g.arc(W / 2, H - 24, 110, Math.PI * 1.86, Math.PI * 2.14); g.stroke();
  // key
  g.beginPath();
  g.moveTo(W / 2 - 45, H - 24); g.lineTo(W / 2 - 45, H - 80);
  g.arc(W / 2, H - 24, 45, Math.PI, 0, true);
  g.lineTo(W / 2 + 45, H - 24);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeBannerTexture(text, bg1, bg2) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, bg1); grad.addColorStop(1, bg2);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.font = "900 64px 'Segoe UI', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeScoreboardTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  drawScoreboard(g, 0, 60, "READY");
  return { tex, g };
}

function drawScoreboard(g, score, time, modeName) {
  g.clearRect(0, 0, 512, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#141b2e"); grad.addColorStop(1, "#0a0e1a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(0, 0, 512, 4);
  g.fillStyle = "#ffd700";
  g.font = "900 30px 'Segoe UI', Arial, sans-serif";
  g.textAlign = "left"; g.textBaseline = "middle";
  g.fillText("SCORE", 24, 40);
  g.font = "900 52px 'Segoe UI', Arial, sans-serif";
  g.fillStyle = "#ffffff";
  g.fillText(String(score).padStart(4, "0"), 24, 88);
  g.textAlign = "center";
  g.fillStyle = "#00e5ff";
  g.font = "900 26px 'Segoe UI', Arial, sans-serif";
  g.fillText(modeName, 256, 30);
  g.font = "900 48px 'Segoe UI', Arial, sans-serif";
  g.fillStyle = time <= 10 ? "#ff5252" : "#ffffff";
  g.fillText(String(Math.ceil(time)).padStart(2, "0"), 256, 86);
  g.textAlign = "right";
  g.fillStyle = "#aab3c4";
  g.font = "900 22px 'Segoe UI', Arial, sans-serif";
  g.fillText("TIME", 488, 40);
}

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,220,160,1)");
  grad.addColorStop(0.35, "rgba(255,150,50,0.6)");
  grad.addColorStop(1, "rgba(255,120,30,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ============================================================
// ENVIRONMENT (arena, court, lights, crowd, scoreboard)
// ============================================================
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d16);
  scene.fog = new THREE.Fog(0x0a0d16, 60, 130);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 10, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.appendChild(renderer.domElement);

  // Controls (preserved from original)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.enablePan = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  // Reflections via RoomEnvironment
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  } catch (e) { /* reflections optional */ }
}

function createArena() {
  // Ambient lights
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2230, 0.55);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambient);

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({
    map: makeWoodFloorTexture(),
    roughness: 0.62,
    metalness: 0.05,
    envMapIntensity: 0.5,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Court markings overlay
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    new THREE.MeshBasicMaterial({ map: makeCourtTexture(), transparent: true, depthWrite: false })
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set(0, 0.02, 4);
  scene.add(court);

  // Floor physics
  const floorBody = new CANNON.Body({ mass: 0, material: physMaterial });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  floorBody.userData = { type: "floor" };
  world.addBody(floorBody);

  // Arena walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.85, metalness: 0.05 });
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(80, 22, 0.8), wallMat);
  wallBack.position.set(0, 11, -20);
  scene.add(wallBack);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 22, 60), wallMat);
  wallLeft.position.set(-40, 11, 12);
  scene.add(wallLeft);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 22, 60), wallMat);
  wallRight.position.set(40, 11, 12);
  scene.add(wallRight);
  const wallFront = new THREE.Mesh(new THREE.BoxGeometry(80, 22, 0.8), wallMat);
  wallFront.position.set(0, 11, 44);
  wallFront.visible = false; // invisible so camera can see inside
  scene.add(wallFront);

  // Ceiling + light panels
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: 0x151a26, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 22, 12);
  scene.add(ceil);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 8; i++) {
    const px = -14 + i * 4;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.4), panelMat);
    panel.position.set(px, 21.8, 6);
    scene.add(panel);
  }

  // Stadium spotlights
  const spotGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spotDefs = [
    [-8, 20.5, 14], [8, 20.5, 14], [-4, 20.5, 2], [4, 20.5, 2], [-12, 20.5, -6], [12, 20.5, -6],
  ];
  spotDefs.forEach((s) => {
    const m = new THREE.Mesh(spotGeo, spotMat);
    m.position.set(s[0], s[1], s[2]);
    scene.add(m);
    const light = new THREE.SpotLight(0xfff4e0, 1.4, 70, 0.55, 0.6, 1.6);
    light.position.set(s[0], s[1] - 0.4, s[2]);
    light.target.position.set(s[0] * 0.25, 0, s[2] * 0.3);
    if (s[0] === -8 || s[0] === 8) {
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.camera.near = 1;
      light.shadow.camera.far = 60;
    }
    scene.add(light);
    scene.add(light.target);
  });

  // Key directional light (from original, brighter)
  const dirLight = new THREE.DirectionalLight(0xfff1e0, 1.1);
  dirLight.position.set(10, 25, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // Banners
  const banner1 = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture("MONKEYBALL", "#ff7a18", "#ff2d55") }));
  banner1.position.set(0, 15, -19.4);
  scene.add(banner1);
  const banner2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture("SWISH ZONE", "#00e5ff", "#0077ff") }));
  banner2.position.set(-39.4, 14, 6);
  banner2.rotation.y = Math.PI / 2;
  scene.add(banner2);
  const banner3 = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture("3PT SHOOTOUT", "#ffd700", "#ff8a00") }));
  banner3.position.set(39.4, 14, 6);
  banner3.rotation.y = -Math.PI / 2;
  scene.add(banner3);

  createCrowd();
  createScoreboard();
}

function createCrowd() {
  const count = 400;
  const geo = new THREE.BoxGeometry(0.72, 1.2, 0.55);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const crowd = new THREE.InstancedMesh(geo, mat, count);
  crowd.frustumCulled = false;
  crowd.userData.isCrowd = true;
  const colors = [0xd64545, 0x4a9bd8, 0x3fbf7f, 0xf2c94c, 0xb07bd6, 0xf2994a, 0xffffff, 0x9aa5b1, 0x2f3542, 0xffd27a];
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const baseMatrices = [];
  const phases = [];
  let i = 0;

  const addRow = (x0, x1, z0, z1, y, stepX, stepZ, jitter) => {
    for (let x = x0; x <= x1; x += stepX) {
      for (let z = z0; z <= z1; z += stepZ) {
        if (i >= count) return;
        dummy.position.set(x + (Math.random() - 0.5) * jitter, y + (Math.random() - 0.5) * 0.2, z + (Math.random() - 0.5) * jitter);
        dummy.scale.set(1, 0.9 + Math.random() * 0.25, 1);
        dummy.rotation.set(0, Math.random() * 0.2 - 0.1, 0);
        dummy.updateMatrix();
        crowd.setMatrixAt(i, dummy.matrix);
        baseMatrices.push(dummy.matrix.clone());
        phases.push(x + z); // phase seed
        c.setHex(colors[(Math.random() * colors.length) | 0]);
        crowd.setColorAt(i, c);
        i++;
      }
    }
  };

  // Back stands
  addRow(-24, 24, -16, -15, 0.5, 1.5, 1.1, 0.3);
  addRow(-24, 24, -17.5, -16.6, 1.6, 1.5, 1.1, 0.3);
  // Left stands
  addRow(-30, -10, -2, 30, 0.5, 1.1, 1.5, 0.3);
  // Right stands
  addRow(10, 30, -2, 30, 0.5, 1.1, 1.5, 0.3);

  crowd.count = i;
  crowd._baseMatrices = baseMatrices;
  crowd._phases = phases;
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  scene.add(crowd);
}

function createScoreboard() {
  const { tex, g } = makeScoreboardTexture();
  const sb = new THREE.Mesh(
    new THREE.BoxGeometry(5, 1.3, 0.35),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  sb.position.set(0, 17, 9);
  sb.rotation.y = Math.PI; // face camera
  scene.add(sb);
  sb.userData.scoreCtx = g;
  sb.userData.scoreTex = tex;
  // supports
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x444c5c }));
  pole.position.set(0, 15.7, 9);
  scene.add(pole);
  return sb;
}

function updateScoreboard3D(elapsed) {
  if (performance.now() - scoreboardDirtyAt < 150) return;
  scoreboardDirtyAt = performance.now();
  const sb = scoreboardMesh;
  if (!sb) return;
  const cfg = MODES[state.mode];
  const timeVal = cfg.time > 0 ? state.timeLeft : state.elapsed;
  drawScoreboard(sb.userData.scoreCtx, state.score, timeVal, cfg.name);
  sb.userData.scoreTex.needsUpdate = true;
}

let scoreboardMesh = null;

// ============================================================
// PHYSICS WORLD
// ============================================================
function initPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, GRAVITY, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 50;

  physMaterial = new CANNON.Material("phys");
  netMaterial = new CANNON.Material("net");

  const contactMat = new CANNON.ContactMaterial(physMaterial, physMaterial, {
    friction: 0.1,
    restitution: 0.6,
  });
  const netContact = new CANNON.ContactMaterial(physMaterial, netMaterial, {
    friction: 0.01,
    restitution: 0.0,
  });
  world.addContactMaterial(contactMat);
  world.addContactMaterial(netContact);
}

let physMaterial, netMaterial;

// ============================================================
// HOOP (ring, backboard, net, glow)
// ============================================================
function createHoop(radius) {
  hoop.radius = radius;
  hoop.group = new THREE.Group();
  hoop.ringBodies = [];
  hoop.netBodies = [];

  // Backboard
  const boardW = 3.6, boardH = 2.6, boardD = 0.1;
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.3, metalness: 0.1, envMapIntensity: 0.6 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, boardD), boardMat);
  boardMesh.position.set(0, 1.3, -1.2);
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  hoop.group.add(boardMesh);
  hoop.boardMesh = boardMesh;

  // Inner square on backboard
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.0, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c })
  );
  inner.position.set(0, 0.75, -1.21);
  hoop.group.add(inner);

  // Ring
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.05, 16, 40),
    new THREE.MeshStandardMaterial({ color: 0xff3b1f, roughness: 0.35, metalness: 0.45, emissive: 0x330800, envMapIntensity: 0.8 })
  );
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.castShadow = true;
  ringMesh.receiveShadow = true;
  hoop.group.add(ringMesh);
  hoop.ringMesh = ringMesh;

  // Ring glow (additive torus, animated on score)
  const ringGlow = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.07, 0.09, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ringGlow.rotation.x = Math.PI / 2;
  hoop.group.add(ringGlow);
  hoop.ringGlow = ringGlow;

  hoop.group.position.set(state.hoopX, HOOP_POS.y, HOOP_POS.z);
  scene.add(hoop.group);

  // Dynamic hoop light
  const light = new THREE.PointLight(0xff6a2a, 0, 12, 1.6);
  light.position.set(0, 0.2, 0.3);
  hoop.group.add(light);
  hoop.light = light;

  // Physics: ring segments
  createPhysicalRing(radius);

  // Physics: backboard
  const boardBody = new CANNON.Body({ mass: 0, material: physMaterial });
  boardBody.addShape(new CANNON.Box(new CANNON.Vec3(boardW / 2, boardH / 2, boardD / 2)));
  boardBody.position.set(state.hoopX, HOOP_POS.y + 1.3, HOOP_POS.z - 1.2);
  boardBody.userData = { type: "board" };
  world.addBody(boardBody);
  hoop.boardBody = boardBody;

  // Net
  createNet(radius);
}

function createPhysicalRing(radius) {
  const segments = 16;
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const angle = step * i;
    const x = Math.cos(angle) * radius;
    const localZ = Math.sin(angle) * radius;
    const b = new CANNON.Body({ mass: 0, material: physMaterial });
    b.addShape(new CANNON.Box(new CANNON.Vec3(0.04, 0.04, 0.1)));
    b.position.set(state.hoopX + x, HOOP_POS.y, HOOP_POS.z + localZ);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle);
    b.userData = { type: "rim" };
    world.addBody(b);
    hoop.ringBodies.push(b);
  }
}

function createNet(radius) {
  const cols = hoop.netCols, rows = hoop.netRows;
  const cx = state.hoopX, cy = HOOP_POS.y, cz = HOOP_POS.z;
  const startRad = radius * 0.95;
  hoop.netConstraints = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const angle = (c / cols) * Math.PI * 2;
      const curRad = startRad - (r * 0.065);
      const px = cx + Math.cos(angle) * curRad;
      const py = cy - (r * 0.25);
      const pz = cz + Math.sin(angle) * curRad;
      const mass = (r === 0) ? 0 : 0.03;
      const b = new CANNON.Body({
        mass,
        shape: new CANNON.Sphere(0.08),
        material: netMaterial,
        linearDamping: 0.05,
      });
      b.position.set(px, py, pz);
      b.collisionFilterGroup = 2;
      b.collisionFilterMask = 1;
      b.userData = { type: "net", baseX: px, baseZ: pz };
      world.addBody(b);
      hoop.netBodies.push(b);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const body = hoop.netBodies[idx];
      const nextCol = (c + 1) % cols;
      const rightBody = hoop.netBodies[r * cols + nextCol];
      const c1 = new CANNON.DistanceConstraint(body, rightBody, body.position.distanceTo(rightBody.position));
      world.addConstraint(c1);
      hoop.netConstraints.push(c1);
      if (r < rows - 1) {
        const downBody = hoop.netBodies[(r + 1) * cols + c];
        const c2 = new CANNON.DistanceConstraint(body, downBody, body.position.distanceTo(downBody.position));
        world.addConstraint(c2);
        hoop.netConstraints.push(c2);
      }
    }
  }

  const positions = new Float32Array(rows * cols * 2 * 2 * 3);
  hoop.netGeo = new THREE.BufferGeometry();
  hoop.netGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  hoop.netMesh = new THREE.LineSegments(
    hoop.netGeo,
    new THREE.LineBasicMaterial({ color: 0xeeeeee, opacity: 0.75, transparent: true })
  );
  scene.add(hoop.netMesh);
}

function updateNet() {
  if (!hoop.netGeo) return;
  const pos = hoop.netGeo.attributes.position.array;
  const cols = hoop.netCols, rows = hoop.netRows;
  let ptr = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = hoop.netBodies[r * cols + c];
      const rb = hoop.netBodies[r * cols + ((c + 1) % cols)];
      pos[ptr++] = b.position.x; pos[ptr++] = b.position.y; pos[ptr++] = b.position.z;
      pos[ptr++] = rb.position.x; pos[ptr++] = rb.position.y; pos[ptr++] = rb.position.z;
      if (r < rows - 1) {
        const db = hoop.netBodies[(r + 1) * cols + c];
        pos[ptr++] = b.position.x; pos[ptr++] = b.position.y; pos[ptr++] = b.position.z;
        pos[ptr++] = db.position.x; pos[ptr++] = db.position.y; pos[ptr++] = db.position.z;
      }
    }
  }
  hoop.netGeo.attributes.position.needsUpdate = true;
}

// Moving hoop support
function updateMovingHoop(dtReal, nowMs) {
  const cfg = MODES[state.mode];
  if (!cfg.hoopMove) return;
  const speed = state.mode === "hard" ? 1.1 : 2.0;
  const amp = 4.5;
  const target = Math.sin(nowMs * 0.001 * speed) * amp;
  const dx = target - state.hoopX;
  state.hoopX = target;
  if (Math.abs(dx) < 0.0001) return;
  hoop.group.position.x = target;
  for (const b of hoop.ringBodies) b.position.x += dx;
  hoop.boardBody.position.x += dx;
  for (const b of hoop.netBodies) b.position.x += dx;
}

// ============================================================
// BALL
// ============================================================
function createBallVisual() {
  // Cache texture + material for performance (shared across balls)
  if (!ballTexture) ballTexture = makeBallTexture(getSkin());
  if (!ballMaterial) {
    ballMaterial = new THREE.MeshStandardMaterial({ map: ballTexture, roughness: 0.5, metalness: 0.02, envMapIntensity: 0.6 });
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), ballMaterial);
  mesh.castShadow = true;

  // Wire highlight (original)
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS + 0.01, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.18 })
  );
  mesh.add(wire);

  // Invisible hitbox (original)
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 3.0, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.0 })
  );
  hitMesh.userData.isHitbox = true;
  mesh.add(hitMesh);

  // Glow halo around the ball
  if (!glowTexture) glowTexture = makeGlowTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
  }));
  halo.scale.set(2.1, 2.1, 1);
  mesh.add(halo);

  scene.add(mesh);
  return mesh;
}

function spawnNewBall() {
  if (currentBall) return;
  const randX = (Math.random() - 0.5) * 12;
  const randY = 8.5 + Math.random() * 3;
  const randZ = 8 + Math.random() * 5;
  const spawnPos = new THREE.Vector3(randX, randY, randZ);

  const mesh = createBallVisual();

  const body = new CANNON.Body({
    mass: 0.6,
    shape: new CANNON.Sphere(BALL_RADIUS),
    material: physMaterial,
  });
  body.linearDamping = 0.1;
  body.position.copy(spawnPos);
  body.type = CANNON.Body.STATIC;
  body.collisionFilterGroup = 1;
  body.collisionFilterMask = 1 | 2;
  body.userData = { type: "ball" };

  mesh.position.copy(body.position);
  world.addBody(body);

  currentBall = {
    mesh,
    body,
    scored: false,
    enteredRim: false,
    touchedRim: false,
    touchedBoard: false,
    thrown: false,
    missed: false,
    longShot: false,
    idle: 0,
    trailAcc: 0,
  };

  // Collision listener for audio + contact FX
  const b = currentBall;
  body.addEventListener("collide", (e) => {
    const other = e.body;
    const type = other.userData ? other.userData.type : null;
    if (!type) return;
    const imp = e.contact ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
    const now = performance.now();
    if (type === "rim") {
      b.touchedRim = true;
      if (imp > 1.2 && now - state.lastRimAt > 140) {
        state.lastRimAt = now;
        AudioSys.rim();
        addShake(0.12);
        burstSparks(b.mesh.position, 6, SPARK_COLORS, 4);
        hoop.ringFlash = 1;
      }
    } else if (type === "board") {
      b.touchedBoard = true;
      if (imp > 1.0 && now - state.lastBoardAt > 200) {
        state.lastBoardAt = now;
        AudioSys.board();
        burstSparks(b.mesh.position, 5, [0xffffff, 0xffe6c8], 3.5);
      }
    } else if (type === "floor") {
      if (imp > 0.8 && now - state.lastBounceAt > 90) {
        state.lastBounceAt = now;
        AudioSys.bounce(Math.min(1, imp / 8));
      }
    }
  });

  setCameraTarget(spawnPos);
}

function computeThrowVelocity(dragY, dragX) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  camDir.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const camRight = new THREE.Vector3().crossVectors(camDir, up).normalize();
  const forwardForce = 6 + dragY * 0.025;
  const upForce = 11 + dragY * 0.030;
  const sideForce = dragX * 0.04;
  return new THREE.Vector3()
    .addScaledVector(camDir, forwardForce)
    .addScaledVector(camRight, sideForce)
    .addScaledVector(up, upForce);
}

function throwBall(dragVector) {
  if (!currentBall || state.screen !== "playing") return;
  const b = currentBall;
  b.body.type = CANNON.Body.DYNAMIC;
  b.body.wakeUp();
  b.thrown = true;
  b.releasedAt = performance.now();

  // Long-distance detection
  const dist = b.mesh.position.distanceTo(new THREE.Vector3(HOOP_POS.x + state.hoopX, HOOP_POS.y, HOOP_POS.z));
  b.longShot = dist > LONG_SHOT_DIST;

  // Release velocity (preserves original feel)
  const vel = computeThrowVelocity(dragVector.y, dragVector.x);
  b.body.velocity.set(vel.x, vel.y, vel.z);
  // Backspin for realistic ball rotation
  b.body.angularVelocity.set(-14, 0, (Math.random() - 0.5) * 3);

  activeBalls.push(b);
  currentBall = null;

  state.shots++;
  updateStatsUI();

  controls.enabled = true;
  hideAim();

  clearTimeout(state.resetTimerId);
  state.resetTimerId = setTimeout(() => {
    if (state.screen === "playing" || state.screen === "countdown") spawnNewBall();
  }, 1600);
}

// ============================================================
// TRAJECTORY PREDICTION + AIM
// ============================================================
function createAim() {
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  aimLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
    color: 0xffff00,
    depthTest: false,
    depthWrite: false,
  }));
  aimLine.renderOrder = 999;
  aimLine.visible = false;
  scene.add(aimLine);

  // Trajectory dots
  const n = 48;
  const tGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  tGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  trajPoints = new THREE.Points(tGeo, new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  trajPoints.frustumCulled = false;
  trajPoints.renderOrder = 998;
  trajPoints.visible = false;
  scene.add(trajPoints);
}

function updateAimDrag(dragVector) {
  const start = currentBall.mesh.position;

  // Simple aim line (preserved)
  const pos = aimLine.geometry.attributes.position.array;
  pos[0] = start.x; pos[1] = start.y; pos[2] = start.z;
  pos[3] = start.x + dragVector.x * 0.01; pos[4] = start.y - dragVector.y * 0.01; pos[5] = start.z;
  aimLine.geometry.attributes.position.needsUpdate = true;
  aimLine.visible = true;

  // Trajectory prediction
  updateTrajectoryPrediction(dragVector);

  // Power meter
  updatePowerMeter(Math.min(1, dragVector.y / 350));
}

function updateTrajectoryPrediction(dragVector) {
  const cfg = MODES[state.mode];
  const showGuide = cfg.aimGuide && settings.aimGuide;
  if (!showGuide || !currentBall) {
    trajPoints.visible = false;
    return;
  }
  const vel = computeThrowVelocity(dragVector.y, dragVector.x);
  const p = currentBall.mesh.position.clone();
  const v = vel.clone();
  const dt = 0.045;
  const n = trajPoints.geometry.attributes.position.count;
  const posArr = trajPoints.geometry.attributes.position.array;
  const colArr = trajPoints.geometry.attributes.color.array;
  const g = world.gravity.y;
  const hoopC = new THREE.Vector3(HOOP_POS.x + state.hoopX, HOOP_POS.y, HOOP_POS.z);
  let prev = p.clone();
  for (let i = 0; i < n; i++) {
    v.y += g * dt;
    p.addScaledVector(v, dt);
    posArr[i * 3] = p.x; posArr[i * 3 + 1] = p.y; posArr[i * 3 + 2] = p.z;
    // color dots green if near hoop window, orange otherwise
    const dy = p.y - HOOP_POS.y;
    const d = Math.hypot(p.x - hoopC.x, p.z - hoopC.z);
    let good = false;
    if (dy > -0.6 && dy < 0.6 && d < hoop.radius * 1.05) good = true;
    // crossing detection
    if (!good && prev.y >= HOOP_POS.y && p.y <= HOOP_POS.y) {
      const t = (HOOP_POS.y - prev.y) / (p.y - prev.y);
      const cx = prev.x + (p.x - prev.x) * t;
      const cz = prev.z + (p.z - prev.z) * t;
      const cd = Math.hypot(cx - hoopC.x, cz - hoopC.z);
      if (cd < hoop.radius * 0.85) good = true;
    }
    if (good) {
      colArr[i * 3] = 0.3; colArr[i * 3 + 1] = 1; colArr[i * 3 + 2] = 0.4;
    } else {
      colArr[i * 3] = 1; colArr[i * 3 + 1] = 0.55; colArr[i * 3 + 2] = 0.15;
    }
    prev.copy(p);
  }
  trajPoints.geometry.attributes.position.needsUpdate = true;
  trajPoints.geometry.attributes.color.needsUpdate = true;
  trajPoints.visible = true;
}

function hideAim() {
  if (aimLine) aimLine.visible = false;
  if (trajPoints) trajPoints.visible = false;
  document.getElementById("power-wrap").classList.add("hidden");
}

function updatePowerMeter(power) {
  const wrap = document.getElementById("power-wrap");
  wrap.classList.remove("hidden");
  const fill = document.getElementById("power-fill");
  fill.style.transform = "scaleX(" + Math.max(0, Math.min(1, power)) + ")";
  fill.style.filter = power > 0.85 ? "brightness(1.4)" : "none";
}

// ============================================================
// INPUT
// ============================================================
let isDragging = false;
let dragStart = { x: 0, y: 0 };

function pointerPos(e) {
  const pt = e.touches ? e.touches[0] : e;
  return { x: pt.clientX, y: pt.clientY };
}

function onPointerDown(e) {
  AudioSys.unlock();
  if (state.screen !== "playing") return;
  if (e.button && e.button !== 0) return;

  const p = pointerPos(e);
  V2.x = (p.x / window.innerWidth) * 2 - 1;
  V2.y = -(p.y / window.innerHeight) * 2 + 1;
  RAY.setFromCamera(V2, camera);

  const hit = currentBall ? RAY.intersectObject(currentBall.mesh, true) : null;
  if (hit && hit.length > 0) {
    isDragging = true;
    dragStart.x = p.x;
    dragStart.y = p.y;
    document.body.style.cursor = "grabbing";
    controls.enabled = false;
    if (e.cancelable) e.preventDefault();
  }
}

function onPointerMove(e) {
  if (state.screen !== "playing") return;
  const p = pointerPos(e);

  if (isDragging && currentBall) {
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    updateAimDrag({ x: dx, y: dy });
    if (e.cancelable) e.preventDefault();
    return;
  }

  // Hover detection (mouse only)
  if (e.touches) return;
  V2.x = (p.x / window.innerWidth) * 2 - 1;
  V2.y = -(p.y / window.innerHeight) * 2 + 1;
  RAY.setFromCamera(V2, camera);
  const intersects = currentBall ? RAY.intersectObject(currentBall.mesh, true) : null;
  if (intersects && intersects.length > 0) {
    document.body.style.cursor = "pointer";
    controls.enabled = false;
  } else {
    document.body.style.cursor = "default";
    if (!isDragging && (state.screen === "playing" || state.screen === "countdown")) {
      controls.enabled = true;
    }
  }
}

function onPointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  hideAim();
  document.body.style.cursor = "default";

  const p = pointerPos(e);
  const dy = p.y - dragStart.y;
  const dx = dragStart.x - p.x;
  const dist = Math.hypot(p.x - dragStart.x, p.y - dragStart.y);

  if (dist > 25 && dy > 0) {
    throwBall({ x: dx, y: dy });
  } else {
    controls.enabled = true;
  }
  if (e.cancelable) e.preventDefault();
}

// ============================================================
// SCORING, COMBO & STATS
// ============================================================
function comboMultiplier(streak) {
  if (streak <= 0) return 1;
  return Math.min(streak, 5);
}

function getHoopCenter() {
  return tempVec2.set(HOOP_POS.x + state.hoopX, HOOP_POS.y, HOOP_POS.z);
}

function scoreBasket(ball) {
  ball.scored = true;
  const now = performance.now();

  // Bonus detection
  const perfect = !ball.touchedRim && !ball.touchedBoard;
  const bank = ball.touchedBoard;
  const long = ball.longShot;
  const fast = now - state.lastScoreAt < FAST_SHOT_MS;

  const cfg = MODES[state.mode];

  // Trick shot mode: only swish/bank count
  if (cfg.trickOnly && !perfect && !bank) {
    state.streak = 0;
    updateComboUI();
    updateFireUI();
    state.makes++;
    AudioSys.miss();
    spawnFloatText("NO POINT", "white", getHoopCenter());
    state.lastScoreAt = now;
    return;
  }

  // Streak + combo
  state.streak++;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  const mult = comboMultiplier(state.streak);
  const enteredFire = mult >= 5 && !state.fire;
  state.fire = mult >= 5;
  if (enteredFire) state.fireTimes++;

  // Points
  let pts = 2;
  const labels = [];
  if (perfect) { pts += 2; labels.push("PERFECT"); }
  if (bank) { pts += 1; labels.push("BANK"); }
  if (long) { pts += 1; labels.push("LONG"); }
  if (fast) { pts += 1; labels.push("FAST"); }
  const total = pts * mult;

  state.score += total;
  state.makes++;
  state.misses = Math.max(0, state.shots - state.makes);
  state.perfects += perfect ? 1 : 0;
  state.banks += bank ? 1 : 0;
  state.longshots += long ? 1 : 0;
  state.fastshots += fast ? 1 : 0;
  state.lastScoreAt = now;

  // Challenge tracking (per-challenge counters)
  state.chStats.make++;
  if (perfect) state.chStats.perfect++;
  if (bank) state.chStats.bank++;
  if (long) state.chStats.long++;
  if (enteredFire) state.chStats.fire++;
  updateChallengeProgress();

  // Audio
  AudioSys.swish();
  if (perfect) AudioSys.perfect();
  if (mult > 1) AudioSys.combo(mult);
  if (enteredFire) AudioSys.fire();
  else if (state.makes % 4 === 0) AudioSys.cheer();
  if (fast) AudioSys.click();

  // FX
  const hoopC = getHoopCenter();
  burstSparks(hoopC, perfect ? 26 : 14, SPARK_COLORS, 9);
  hoop.ringFlash = 1;
  hoop.lightFlash = 1;
  pulseScreen();
  addShake(perfect ? 0.28 : 0.16);
  if (enteredFire) {
    burstConfetti(null, 80);
    flashScreen();
  } else if (perfect) {
    flashScreen();
  }

  // Floating score text
  const cls = enteredFire ? "fire" : perfect ? "gold" : "orange";
  spawnFloatText("+" + total, cls, hoopC, labels.join(" "));

  // Floating combo milestone text
  if (state.streak >= 2 && (state.streak === 5 || state.streak === 3 || state.streak === 4 || state.streak === 6 || state.streak === 8 || state.streak === 10)) {
    const hoopAbove = tempVec2.set(HOOP_POS.x + state.hoopX, HOOP_POS.y + 2.2, HOOP_POS.z);
    spawnFloatText(enteredFire ? "COMBO FIRE" : "COMBO x" + state.streak, enteredFire ? "fire" : "cyan", hoopAbove);
  }

  // Slow motion on perfect shot
  if (perfect && !REDUCED_MOTION) {
    state.slowTarget = 0.25;
    setTimeout(() => { state.slowTarget = 1; }, 350);
  }

  // Praise animation (preserved + extended)
  showPraise(mult, perfect, bank);

  // Time Attack: add time
  if (state.mode === "timeattack") state.timeLeft += TIME_ATTACK_BONUS;

  // Fire mode UI
  updateFireUI();
  updateComboUI();
  updateScoreUI();
  updateStatsUI();
  scoreZoom();
}

function updateChallengeProgress() {
  if (state.mode !== "challenge") return;
  const obj = CHALLENGES[state.challengeIndex];
  if (!obj) return;
  let progress;
  if (obj.type === "streak") progress = state.streak;
  else progress = state.chStats[obj.type];

  updateChallengeUI(progress, obj.target);

  if (progress >= obj.target) challengeComplete();
}

function challengeComplete() {
  if (state.mode !== "challenge") return;
  state.score += 300;
  state.challengeIndex++;
  state.streak = 0;
  state.fire = false;
  state.chStats = { make: 0, perfect: 0, bank: 0, fire: 0, long: 0 };
  updateScoreUI();
  updateComboUI();
  updateFireUI();
  burstConfetti(null, 100);
  AudioSys.challengeClear();
  spawnFloatText("+300", "gold", new THREE.Vector3(HOOP_POS.x, HOOP_POS.y + 3, HOOP_POS.z), "CHALLENGE CLEARED");

  if (state.challengeIndex >= CHALLENGES.length) {
    finishGame("CHAMPION");
    return;
  }
  // Start next challenge
  state.timeLeft = MODES.challenge.time;
  const next = CHALLENGES[state.challengeIndex];
  updateChallengeUI(0, next.target);
}

function markMiss(ball) {
  if (ball.missed || ball.scored) return;
  ball.missed = true;
  state.misses++;
  if (state.streak > 0) {
    state.streak = 0;
    state.fire = false;
    updateComboUI();
    updateFireUI();
    spawnFloatText("MISS", "white", getHoopCenter());
    AudioSys.miss();
  }
  updateStatsUI();
}

function checkGoals() {
  for (const ball of activeBalls) {
    if (ball.scored) continue;
    const bPos = ball.mesh.position;
    const dx = bPos.x - (HOOP_POS.x + state.hoopX);
    const dz = bPos.z - HOOP_POS.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Preserved scoring logic, adapted for hoop radius + moving hoop
    if (dist < hoop.radius * 0.9) {
      if (bPos.y > HOOP_POS.y) ball.enteredRim = true;
      if (bPos.y < HOOP_POS.y && bPos.y > HOOP_POS.y - 1.0 && ball.enteredRim) {
        scoreBasket(ball);
      }
    }

    // Miss detection
    if (ball.thrown && !ball.scored && !ball.missed) {
      if (bPos.y < HOOP_POS.y - 1.5 && ball.body.velocity.y < 0) {
        markMiss(ball);
      }
    }
  }
}

// ============================================================
// GAME MODES & TIMER
// ============================================================
function startMode(mode) {
  state.mode = mode;
  const cfg = MODES[mode];

  // Reset state
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.fire = false;
  state.fireTimes = 0;
  state.shots = 0;
  state.makes = 0;
  state.misses = 0;
  state.perfects = 0;
  state.banks = 0;
  state.longshots = 0;
  state.fastshots = 0;
  state.elapsed = 0;
  state.timeLeft = cfg.time;
  state.hoopX = 0;
  state.challengeIndex = 0;
  state.chStats = { make: 0, perfect: 0, bank: 0, fire: 0, long: 0 };
  state.slow = 1;
  state.slowTarget = 1;
  state.lastScoreAt = performance.now();

  // Clear leftover balls
  for (const b of activeBalls.slice()) {
    scene.remove(b.mesh);
    world.removeBody(b.body);
    disposeBallVisual(b.mesh);
  }
  activeBalls.length = 0;
  if (currentBall) {
    scene.remove(currentBall.mesh);
    world.removeBody(currentBall.body);
    disposeBallVisual(currentBall.mesh);
    currentBall = null;
  }
  clearTimeout(state.resetTimerId);

  // Reset input drag state
  isDragging = false;
  hideAim();
  document.body.style.cursor = "default";
  controls.enabled = false;

  // Rebuild hoop with mode ring scale
  destroyHoop();
  createHoop(RING_RADIUS * cfg.ringScale);

  spawnNewBall();

  // UI setup
  showScreen("hud");
  document.getElementById("mode-label").textContent = cfg.name;
  document.getElementById("challenge-box").classList.toggle("hidden", mode !== "challenge");
  document.getElementById("combo-wrap").classList.remove("hidden");
  document.getElementById("fire-indicator").classList.add("hidden");
  document.getElementById("timer-wrap").classList.toggle("low", false);
  if (mode === "challenge") updateChallengeUI(0, CHALLENGES[0].target);

  updateScoreUI();
  updateComboUI();
  updateStatsUI();
  updateTimerUI();

  AudioSys.stopMusic();
  startCountdown();
}

function disposeHoopVisual() {
  if (hoop.group) {
    hoop.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
  if (hoop.netMesh) {
    if (hoop.netGeo) hoop.netGeo.dispose();
    if (hoop.netMesh.material) hoop.netMesh.material.dispose();
  }
}

function disposeBallVisual(mesh) {
  if (!mesh) return;
  mesh.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && child.material !== ballMaterial) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function destroyHoop() {
  if (hoop.group) {
    scene.remove(hoop.group);
    disposeHoopVisual();
    hoop.group = null;
  }
  if (hoop.netMesh) { scene.remove(hoop.netMesh); hoop.netMesh = null; }
  hoop.netGeo = null;
  for (const c of hoop.netConstraints) world.removeConstraint(c);
  hoop.netConstraints.length = 0;
  for (const b of hoop.ringBodies) world.removeBody(b);
  for (const b of hoop.netBodies) world.removeBody(b);
  hoop.ringBodies.length = 0;
  hoop.netBodies.length = 0;
  if (hoop.boardBody) { world.removeBody(hoop.boardBody); hoop.boardBody = null; }
}

function startCountdown() {
  state.screen = "countdown";
  controls.enabled = false;
  hideAim();
  const overlay = document.getElementById("overlay-countdown");
  const numEl = document.getElementById("countdown-num");
  overlay.classList.remove("hidden");
  let n = 3;

  const tick = () => {
    numEl.textContent = n > 0 ? String(n) : "GO";
    numEl.style.animation = "none";
    void numEl.offsetWidth;
    numEl.style.animation = "";
    if (n > 0) AudioSys.countBeep(); else AudioSys.go();
    if (n <= 0) {
      overlay.classList.add("hidden");
      beginPlay();
      return;
    }
    n--;
    setTimeout(tick, n > 0 ? 850 : 650);
  };
  tick();
}

function beginPlay() {
  state.screen = "playing";
  controls.enabled = true;
  if (currentBall) setCameraTarget(currentBall.mesh.position);
  AudioSys.startMusic();
}

function pauseGame() {
  if (state.screen !== "playing") return;
  state.screen = "paused";
  AudioSys.stopMusic();
  AudioSys.click();
  document.getElementById("pause-score").textContent = "SCORE: " + state.score;
  openOverlay("overlay-pause", $("btn-resume"));
  hideAim();
}

function resumeGame() {
  if (state.screen !== "paused") return;
  state.screen = "playing";
  document.getElementById("overlay-pause").classList.add("hidden");
  AudioSys.click();
  AudioSys.startMusic();
  restoreFocus();
}

function quitToMenu() {
  AudioSys.stopMusic();
  state.screen = "menu";
  document.getElementById("overlay-pause").classList.add("hidden");
  document.getElementById("overlay-gameover").classList.add("hidden");
  document.getElementById("overlay-settings").classList.add("hidden");
  showMenuScreens();
  updateMenuLeaderboardPreview();
}

function finishGame(title) {
  state.screen = "gameover";
  AudioSys.stopMusic();
  AudioSys.buzzer();
  hideAim();
  controls.enabled = false;

  const mode = state.mode;
  const cfg = MODES[mode];
  const acc = state.shots > 0 ? Math.round((state.makes / state.shots) * 100) : 0;

  // Save high score
  const isRecord = saveScore(mode, state.score, state.bestStreak, acc);
  if (isRecord) {
    burstConfetti(null, 160);
    setTimeout(() => burstConfetti(null, 120), 400);
    setTimeout(() => AudioSys.cheer(), 600);
  }

  document.getElementById("gameover-title").textContent = title || "GAME OVER";
  document.getElementById("gameover-title").style.color = isRecord ? "var(--c-gold)" : "";
  document.getElementById("gameover-score").textContent = state.score;
  document.getElementById("new-record").classList.toggle("hidden", !isRecord);
  document.getElementById("go-best-streak").textContent = state.bestStreak;
  document.getElementById("go-makes").textContent = state.makes;
  document.getElementById("go-misses").textContent = state.misses;
  document.getElementById("go-accuracy").textContent = acc + "%";
  document.getElementById("go-perfects").textContent = state.perfects;
  document.getElementById("go-banks").textContent = state.banks;
  document.getElementById("go-fire").textContent = state.fireTimes;

  // Screen-reader announcement of final results
  const live = document.getElementById("gameover-live");
  if (live) {
    live.textContent =
      "Game over. Final score " + state.score +
      (isRecord ? ", a new record. " : ". ") +
      state.makes + " baskets out of " + state.shots + " shots, " + acc + "% accuracy.";
  }

  renderLeaderboard(mode, document.getElementById("gameover-leaderboard"));
  showScreen("overlay-gameover");
  $("btn-replay").focus();
}

// ============================================================
// HIGH SCORES / LEADERBOARD
// ============================================================
function getScores(mode) {
  const all = loadHighScores();
  return all[mode] || [];
}

function saveScore(mode, score, streak, acc) {
  const all = loadHighScores();
  const list = all[mode] || [];
  list.push({ score, streak, acc, date: new Date().toLocaleDateString() });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 6);
  all[mode] = trimmed;
  saveHighScores(all);
  return trimmed[0].score === score && score > 0;
}

function renderLeaderboard(mode, container) {
  const list = getScores(mode);
  container.innerHTML = "<h3>LEADERBOARD - " + MODES[mode].name + "</h3>";
  if (list.length === 0) {
    container.innerHTML += '<div class="lb-empty">No scores yet - be the first!</div>';
    return;
  }
  list.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "lb-row" + (i === 0 ? " first" : "");
    row.innerHTML =
      '<span class="lb-rank">' + (i + 1) + "</span>" +
      '<span class="lb-score">' + entry.score + " pts</span>" +
      '<span class="lb-meta">streak ' + entry.streak + " / " + entry.acc + "% acc</span>";
    container.appendChild(row);
  });
}

function getBestOverall() {
  const all = loadHighScores();
  let best = 0;
  for (const k in all) for (const e of all[k]) best = Math.max(best, e.score);
  return best;
}

function renderMenuLeaderboard() {
  const body = document.getElementById("menu-leaderboard-body");
  body.innerHTML = "";
  const modes = ["arcade", "timeattack", "moving", "trickshot", "challenge", "hard", "practice"];
  for (const m of modes) {
    const list = getScores(m);
    if (list.length === 0) continue;
    const wrap = document.createElement("div");
    wrap.className = "leaderboard";
    const title = document.createElement("h3");
    title.textContent = MODES[m].name;
    wrap.appendChild(title);
    list.slice(0, 3).forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "lb-row" + (i === 0 ? " first" : "");
      row.innerHTML =
        '<span class="lb-rank">' + (i + 1) + "</span>" +
        '<span class="lb-score">' + entry.score + " pts</span>" +
        '<span class="lb-meta">streak ' + entry.streak + "</span>";
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
  }
  if (!body.hasChildNodes()) {
    body.innerHTML = '<div class="lb-empty">No scores yet. Play a game!</div>';
  }
}

// ============================================================
// UI
// ============================================================
const $ = (id) => document.getElementById(id);

let lastFocusedEl = null;

function focusFirstFocusable(container) {
  const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const els = container.querySelectorAll(selectors);
  for (const el of els) {
    if (el.offsetParent !== null || el.getClientRects().length > 0) {
      el.focus();
      return;
    }
  }
}

function openOverlay(id, focusTarget) {
  lastFocusedEl = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  document.querySelectorAll(".overlay").forEach((o) => o.classList.add("hidden"));
  const overlay = document.getElementById(id);
  overlay.classList.remove("hidden");
  if (focusTarget) focusTarget.focus();
  else focusFirstFocusable(overlay.querySelector(".panel") || overlay);
  return overlay;
}

function restoreFocus() {
  if (lastFocusedEl && lastFocusedEl.isConnected && document.contains(lastFocusedEl)) {
    lastFocusedEl.focus();
  }
}

function trapFocus(e) {
  if (e.key !== "Tab") return;
  const overlay = Array.from(document.querySelectorAll(".overlay"))
    .find((o) => !o.classList.contains("hidden"));
  if (!overlay) return;
  const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusables = Array.from(overlay.querySelectorAll(selectors))
    .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === document.body)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function showScreen(name) {
  document.querySelectorAll(".overlay").forEach((o) => o.classList.add("hidden"));
  document.getElementById("hud").classList.toggle("hidden", name === "overlay-menu");
  if (name && name.startsWith("overlay-")) {
    const el = document.getElementById(name);
    if (el) el.classList.remove("hidden");
  }
}

function showMenuScreens(focusOnShow = true) {
  document.querySelectorAll(".overlay").forEach((o) => o.classList.add("hidden"));
  document.getElementById("overlay-menu").classList.remove("hidden");
  document.getElementById("hud").classList.add("hidden");
  if (focusOnShow) focusFirstFocusable($("overlay-menu").querySelector(".panel"));
}

function updateScoreUI() {
  const el = $("scoreboard");
  el.textContent = state.score;
  if (!REDUCED_MOTION) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
}

function updateComboUI() {
  const wrap = $("combo-wrap");
  const mult = comboMultiplier(state.streak);
  $("combo-value").textContent = "x" + mult;
  $("combo-fill").style.transform = "scaleX(" + mult / 5 + ")";
  wrap.classList.toggle("fire", state.fire);
}

function updateFireUI() {
  const el = $("fire-indicator");
  if (state.fire) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function updateStatsUI() {
  $("stat-shots").textContent = state.shots;
  $("stat-makes").textContent = state.makes;
  $("stat-miss").textContent = state.misses;
  const acc = state.shots > 0 ? Math.round((state.makes / state.shots) * 100) : 0;
  $("stat-acc").textContent = acc + "%";
}

const timerCache = { text: "", frac: -1, low: null };
function updateTimerUI() {
  const cfg = MODES[state.mode];
  const wrap = $("timer-wrap");
  let display, frac, low;
  if (cfg.time > 0) {
    const t = Math.max(0, Math.ceil(state.timeLeft));
    display = "0:" + String(t).padStart(2, "0");
    frac = Math.max(0, Math.min(1, state.timeLeft / cfg.time));
    low = state.timeLeft <= 10;
  } else {
    const s = Math.floor(state.elapsed);
    display = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    frac = 1;
    low = false;
  }
  if (display !== timerCache.text) {
    $("timer-text").textContent = display;
    timerCache.text = display;
  }
  if (Math.abs(frac - timerCache.frac) > 0.002) {
    $("timer-fill").style.transform = "scaleX(" + frac + ")";
    timerCache.frac = frac;
  }
  if (low !== timerCache.low) {
    wrap.classList.toggle("low", low);
    timerCache.low = low;
  }
}

function updateChallengeUI(progress, target) {
  if (state.mode !== "challenge") return;
  const obj = CHALLENGES[state.challengeIndex];
  if (!obj) return;
  const t = target !== undefined ? target : obj.target;
  const p = Math.min(t, progress || 0);
  $("challenge-text").textContent = (state.challengeIndex + 1) + "/" + CHALLENGES.length + "  " + obj.label;
  $("challenge-progress-fill").style.transform = "scaleX(" + p / t + ")";
}

function showPraise(mult, perfect, bank) {
  const el = $("score-msg");
  let msg = "";
  if (perfect) msg = "PERFECT";
  else if (bank) msg = "BANK SHOT!";
  else if (mult >= 5) msg = "ON FIRE!";
  else if (mult >= 3) msg = "HOT STREAK!";
  else msg = PRAISE_PHRASES[Math.floor(Math.random() * PRAISE_PHRASES.length)];
  el.textContent = msg;
  el.style.color = perfect || mult >= 3 ? "#ffd700" : "#ff7a18";
  el.classList.remove("pop-up");
  void el.offsetWidth;
  el.classList.add("pop-up");
  clearTimeout(showPraise._t);
  showPraise._t = setTimeout(() => el.classList.remove("pop-up"), 900);
}

// ============================================================
// CAMERA
// ============================================================
function setCameraTarget(ballPos) {
  const hoopPosXZ = new THREE.Vector3(HOOP_POS.x, 0, HOOP_POS.z);
  const ballPosXZ = new THREE.Vector3(ballPos.x, 0, ballPos.z);
  const direction = new THREE.Vector3().subVectors(ballPosXZ, hoopPosXZ).normalize();
  const cameraDistance = 11;
  cameraTargetPos.copy(ballPos).add(direction.multiplyScalar(cameraDistance));
  cameraTargetPos.y = ballPos.y + 1.5;
  controlsTargetPos.set(HOOP_POS.x + state.hoopX, HOOP_POS.y - 4, HOOP_POS.z);
  state.cameraAnim = true;
}

function scoreZoom() {
  clearTimeout(state.zoomTimer);
  cameraTargetPos.set(HOOP_POS.x + state.hoopX, HOOP_POS.y + 1.4, HOOP_POS.z + 5.2);
  controlsTargetPos.set(HOOP_POS.x + state.hoopX, HOOP_POS.y - 1.5, HOOP_POS.z);
  state.cameraAnim = true;
  state.zoomTimer = setTimeout(() => {
    const b = currentBall || activeBalls[activeBalls.length - 1];
    if (b && (state.screen === "playing" || state.screen === "countdown")) setCameraTarget(b.mesh.position);
  }, 800);
}

function updateCamera(dt) {
  if (state.cameraAnim) {
    camera.position.lerp(cameraTargetPos, 0.05);
    controls.target.lerp(controlsTargetPos, 0.05);
    controls.update();
    if (camera.position.distanceTo(cameraTargetPos) < 0.1) state.cameraAnim = false;
  } else {
    controls.update();
  }

  // Camera shake
  if (state.shake > 0.001) {
    state.shake *= Math.exp(-6 * dt);
    const s = state.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.6;
    camera.position.y += (Math.random() - 0.5) * s * 0.6;
  }
}

// ============================================================
// MAIN LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dtReal = Math.min((nowMs - lastFrameTime) / 1000, 0.1);
  lastFrameTime = nowMs;

  // Slow motion easing
  state.slow += (state.slowTarget - state.slow) * Math.min(1, dtReal * 8);
  const dt = dtReal * state.slow;

  const isActive = state.screen === "playing" || state.screen === "countdown";

  // Physics (paused/frozen otherwise)
  if (isActive) world.step(1 / 60 * state.slow);

  // Game clock
  if (state.screen === "playing") {
    const cfg = MODES[state.mode];
    if (cfg.time > 0) {
      state.timeLeft -= dtReal;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateTimerUI();
        finishGame();
      }
    } else {
      state.elapsed += dtReal;
    }
  }

  // Moving hoop
  if (state.screen === "playing") updateMovingHoop(dtReal, nowMs);

  // Sync current ball
  if (currentBall) {
    currentBall.mesh.position.copy(currentBall.body.position);
    // Fire mode ball trail
    currentBall.trailAcc += dt;
    if (state.fire && currentBall.trailAcc > 0.02) {
      currentBall.trailAcc = 0;
      spawnFireTrail(currentBall.mesh.position);
    }
  }

  // Sync + cleanup active balls
  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const b = activeBalls[i];
    b.mesh.position.copy(b.body.position);
    b.mesh.quaternion.copy(b.body.quaternion);

    // Trail while flying
    if (b.thrown && !b.scored) {
      b.trailAcc += dt;
      if (b.trailAcc > 0.03) {
        b.trailAcc = 0;
        if (state.fire) spawnFireTrail(b.mesh.position);
        else spawnTrail(b.mesh.position);
      }
    }

    // Idle cleanup (ball settled or fell away)
    const speed = b.body.velocity.length();
    if (speed < 0.4) b.idle += dt; else b.idle = 0;
    const remove = b.mesh.position.y < -20 || (b.scored && b.idle > 3.5) || (!b.scored && b.missed && b.idle > 5);
    if (remove) {
      scene.remove(b.mesh);
      world.removeBody(b.body);
      disposeBallVisual(b.mesh);
      activeBalls.splice(i, 1);
    }
  }

  // Cap active balls for performance
  while (activeBalls.length > 14) {
    const old = activeBalls.shift();
    scene.remove(old.mesh);
    world.removeBody(old.body);
    disposeBallVisual(old.mesh);
  }

  if (state.screen === "playing") {
    checkGoals();
  }

  updateNet();

  // FX
  sparksPool.update(dt);
  confettiPool.update(dt);
  firePool.update(dt);
  trailPool.update(dt);

  // Rim glow / light animation
  hoop.ringFlash = Math.max(0, hoop.ringFlash - dt * 4);
  hoop.lightFlash = Math.max(0, hoop.lightFlash - dt * 5);
  hoop.ringGlow.material.opacity = hoop.ringFlash * 0.9;
  hoop.light.intensity = hoop.lightFlash * 9;

  // Crowd animation
  if (crowdInstances) {
    const dummy = crowdDummy;
    const crowd = crowdInstances;
    const t = nowMs * 0.001;
    for (let i = 0; i < crowd.count; i++) {
      dummy.matrix.copy(crowd._baseMatrices[i]);
      dummy.matrix.elements[13] += Math.sin(t * 2 + crowd._phases[i]) * 0.045;
      crowd.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
  }

  updateScoreboard3D();
  updateTimerUI();

  updateCamera(dtReal);

  // Render (with bloom)
  if (settings.bloomOn && composer) composer.render();
  else renderer.render(scene, camera);
}

let crowdInstances = null;
const crowdDummy = new THREE.Object3D();

// ============================================================
// POST-PROCESSING (bloom)
// ============================================================
function initPostFX() {
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7, 0.5, 0.8
    );
    composer.addPass(bloomPass);
  } catch (e) {
    composer = null;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight);
  }
}

// ============================================================
// UI WIRING
// ============================================================
function bindUI() {
  // Mode buttons
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      AudioSys.unlock();
      AudioSys.click();
      startMode(btn.dataset.mode);
    });
  });

  // HUD buttons
  $("btn-pause").addEventListener("click", pauseGame);
  $("btn-restart").addEventListener("click", () => { AudioSys.click(); startMode(state.mode); });
  $("btn-settings").addEventListener("click", () => {
    if (state.screen === "playing") pauseGame();
    openSettings();
  });
  $("btn-fullscreen").addEventListener("click", toggleFullscreen);

  // Pause screen
  $("btn-resume").addEventListener("click", resumeGame);
  $("btn-pause-restart").addEventListener("click", () => { AudioSys.click(); startMode(state.mode); });
  $("btn-quit").addEventListener("click", () => { AudioSys.click(); quitToMenu(); });

  // Menu
  $("btn-open-settings").addEventListener("click", () => { AudioSys.click(); openSettings(); });
  $("btn-view-leaderboard").addEventListener("click", () => {
    AudioSys.click();
    renderMenuLeaderboard();
    openOverlay("overlay-leaderboard", $("btn-close-lb"));
  });
  $("btn-close-lb").addEventListener("click", () => {
    AudioSys.click();
    $("overlay-leaderboard").classList.add("hidden");
    showMenuScreens(false);
    restoreFocus();
  });

  // Settings
  $("btn-close-settings").addEventListener("click", () => {
    AudioSys.click();
    closeSettings();
  });
  $("btn-reset-scores").addEventListener("click", () => {
    AudioSys.click();
    try { localStorage.removeItem(HS_KEY); } catch (e) { /* ignore */ }
    document.getElementById("menu-best").textContent = "BEST: 0";
  });

  // How to Play
  $("btn-open-howto").addEventListener("click", () => {
    AudioSys.click();
    openOverlay("overlay-howto", $("btn-close-howto"));
  });
  $("btn-close-howto").addEventListener("click", () => {
    AudioSys.click();
    $("overlay-howto").classList.add("hidden");
    showMenuScreens(false);
    restoreFocus();
  });

  // Toggles
  $("set-sfx").addEventListener("change", (e) => { settings.sfxOn = e.target.checked; AudioSys.applyGains(); saveSettings(); });
  $("set-music").addEventListener("change", (e) => {
    settings.musicOn = e.target.checked;
    AudioSys.applyGains();
    if (!settings.musicOn) AudioSys.stopMusic();
    else if (state.screen === "playing") AudioSys.startMusic();
    saveSettings();
  });
  $("set-bloom").addEventListener("change", (e) => { settings.bloomOn = e.target.checked; saveSettings(); });
  $("set-guide").addEventListener("change", (e) => { settings.aimGuide = e.target.checked; saveSettings(); });

  // Ball skin picker
  buildSkinPicker();

  // Game over
  $("btn-replay").addEventListener("click", () => { AudioSys.click(); startMode(state.mode); });
  $("btn-back-menu").addEventListener("click", () => { AudioSys.click(); quitToMenu(); });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    const settingsOpen = !$("overlay-settings").classList.contains("hidden");
    const lbOpen = !$("overlay-leaderboard").classList.contains("hidden");
    const howtoOpen = !$("overlay-howto").classList.contains("hidden");
    const k = e.key;
    if (k === "Escape" || k === "p" || k === "P") {
      if (settingsOpen) {
        closeSettings();
      } else if (lbOpen) {
        $("overlay-leaderboard").classList.add("hidden");
        showMenuScreens(false);
        restoreFocus();
      } else if (howtoOpen) {
        $("overlay-howto").classList.add("hidden");
        showMenuScreens(false);
        restoreFocus();
      } else if (state.screen === "playing") {
        pauseGame();
      } else if (state.screen === "paused") {
        resumeGame();
      }
    }
    if ((k === "r" || k === "R") && (state.screen === "playing" || state.screen === "paused")) {
      startMode(state.mode);
    }
  });

  // Fullscreen button state
  $("btn-fullscreen").setAttribute("aria-pressed", "false");
  document.addEventListener("fullscreenchange", () => {
    $("btn-fullscreen").setAttribute("aria-pressed", document.fullscreenElement ? "true" : "false");
  });

  // Use capture phase so we disable OrbitControls before it can rotate on touch
  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keep Tab focus inside the active modal overlay
  document.addEventListener("keydown", trapFocus, true);
}

function openSettings() {
  $("set-sfx").checked = settings.sfxOn;
  $("set-music").checked = settings.musicOn;
  $("set-bloom").checked = settings.bloomOn;
  $("set-guide").checked = settings.aimGuide;
  openOverlay("overlay-settings");
}

function closeSettings() {
  saveSettings();
  $("overlay-settings").classList.add("hidden");
  if (state.screen === "paused") {
    $("overlay-pause").classList.remove("hidden");
    $("btn-resume").focus();
  } else {
    showMenuScreens(false);
    restoreFocus();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function buildSkinPicker() {
  const picker = $("skin-picker");
  if (!picker) return;
  picker.innerHTML = "";
  SKINS.forEach((skin) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "skin-swatch" + (settings.ballSkin === skin.id ? " selected" : "");
    btn.title = skin.name;
    btn.setAttribute("aria-label", "Ball skin " + skin.name);
    btn.setAttribute("aria-pressed", settings.ballSkin === skin.id ? "true" : "false");
    const cv = document.createElement("canvas");
    cv.width = cv.height = 96;
    drawSkinPreview(cv, skin);
    const name = document.createElement("span");
    name.className = "skin-name";
    name.textContent = skin.name;
    btn.appendChild(cv);
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      AudioSys.click();
      settings.ballSkin = skin.id;
      saveSettings();
      applyBallSkin();
      picker.querySelectorAll(".skin-swatch").forEach((b) => {
        const sel = b === btn;
        b.classList.toggle("selected", sel);
        b.setAttribute("aria-pressed", sel ? "true" : "false");
      });
    });
    picker.appendChild(btn);
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadSettings();
  applyBallSkin();
  initPhysics();
  initScene();
  createArena();
  initPostFX();
  initParticles();
  createHoop(RING_RADIUS);
  createAim();
  spawnNewBall();

  // Store crowd reference for animation
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.isCrowd) crowdInstances = obj;
  });

  // Scoreboard mesh reference
  scene.traverse((obj) => {
    if (obj.userData.scoreCtx) scoreboardMesh = obj;
  });

  bindUI();
  renderer.domElement.setAttribute("role", "application");
  renderer.domElement.setAttribute("aria-label", "Basketball arena game. Drag the ball downward and release to shoot.");
  showMenuScreens(false);
  $("menu-best").textContent = "BEST: " + getBestOverall();
  updateMenuLeaderboardPreview();
  drawScoreboard(scoreboardMesh.userData.scoreCtx, 0, 60, "READY");
  scoreboardMesh.userData.scoreTex.needsUpdate = true;

  lastFrameTime = performance.now();
  requestAnimationFrame(animate);
}

function updateMenuLeaderboardPreview() {
  const preview = document.getElementById("menu-best");
  preview.textContent = "BEST: " + getBestOverall() + " pts";
}

// Boot
init();
