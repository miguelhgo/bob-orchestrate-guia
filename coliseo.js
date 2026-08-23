// El Coliseo — mini-juego de acción por rondas en vertical, tributo al estilo
// de los torneos del Coliseo del Olimpo. Todo procedural: sin assets externos.
import * as THREE from 'three';

/* ================================================================ utils */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const $ = id => document.getElementById(id);

function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * clamp(t, 0, 1);
}

/* ================================================================ audio */
const Audio2 = {
  ctx: null, master: null, musicGain: null, muted: false,
  musicTimer: null, step: 0, nextTime: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    try { localStorage.setItem('coliseo_mute', m ? '1' : '0'); } catch (e) {}
  },
  noiseBuf: null,
  getNoise() {
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  },
  env(gain, t0, a, peak, dur) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },
  tone(type, f0, f1, dur, peak = 0.2, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    this.env(g, t0, 0.008, peak, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise(dur, peak, fType, f0, f1, delay = 0, dest = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.getNoise(); s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = fType;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.01, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  },
  swing() { this.noise(0.14, 0.16, 'bandpass', 1600, 380); },
  roll() { this.noise(0.22, 0.12, 'lowpass', 900, 200); },
  hit() { this.tone('square', 240, 90, 0.09, 0.16); this.noise(0.07, 0.14, 'highpass', 2000, 3000); },
  hitBig() { this.tone('square', 180, 55, 0.16, 0.22); this.noise(0.14, 0.2, 'lowpass', 1200, 200); },
  hurt() { this.tone('sawtooth', 130, 60, 0.25, 0.22); this.noise(0.18, 0.12, 'lowpass', 700, 120); },
  fire() { this.noise(0.35, 0.2, 'lowpass', 500, 2200); this.tone('sine', 100, 180, 0.3, 0.12); },
  explode() { this.noise(0.4, 0.3, 'lowpass', 900, 90); this.tone('sine', 120, 40, 0.35, 0.25); },
  ice() {
    [1500, 2100, 2800].forEach((f, i) => this.tone('sine', f, f * 1.4, 0.12, 0.09, i * 0.04));
    this.noise(0.16, 0.08, 'highpass', 4000, 6000);
  },
  thunder() {
    this.noise(0.5, 0.35, 'lowpass', 3000, 100);
    this.tone('square', 60, 30, 0.4, 0.2);
    this.noise(0.06, 0.25, 'highpass', 3000, 6000);
  },
  cure() { [659, 784, 988, 1319].forEach((f, i) => this.tone('sine', f, f, 0.35, 0.1, i * 0.09)); },
  orb() { this.tone('sine', rand(850, 1000), 1500, 0.09, 0.08); },
  heart() { this.tone('sine', 520, 1040, 0.4, 0.08); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.14, i * 0.12)); },
  lose() { [392, 370, 349, 330].forEach((f, i) => this.tone('triangle', f, f, 0.45, 0.13, i * 0.28)); },
  select() { this.tone('sine', 700, 1100, 0.08, 0.1); },
  freezeHit() { this.tone('sine', 2000, 600, 0.15, 0.1); this.noise(0.1, 0.1, 'highpass', 3000, 5000); },

  /* música de batalla: pequeño loop original heroico */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  },
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
  // 2 compases de bajo + arpegio, 16 semicorcheas por compás, ~138 bpm
  bass: [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 50, 0, 48, 0,
         45, 0, 45, 0, 48, 0, 52, 0, 53, 0, 52, 0, 50, 0, 48, 0],
  arp: [0, 57, 60, 64, 0, 57, 60, 64, 0, 55, 59, 62, 0, 55, 59, 62,
        0, 57, 60, 64, 0, 60, 64, 69, 0, 60, 65, 69, 0, 59, 64, 67],
  schedule() {
    const spb = 60 / 138 / 4; // segundos por semicorchea
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const i = this.step % 32, t = this.nextTime;
      if (this.muted) { this.step++; this.nextTime += spb; continue; }
      const nb = this.bass[i];
      if (nb) {
        const f = 440 * Math.pow(2, (nb - 69) / 12);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        this.env(g, t, 0.01, 0.5, spb * 1.8);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb * 2);
      }
      const na = this.arp[i];
      if (na) {
        const f = 440 * Math.pow(2, (na - 69) / 12);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        this.env(g, t, 0.005, 0.12, spb * 1.1);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb * 1.4);
      }
      if (i % 4 === 0) { // percusión suave
        const s = this.ctx.createBufferSource(); s.buffer = this.getNoise(); s.loop = true;
        const f = this.ctx.createBiquadFilter(); f.type = i % 8 === 0 ? 'lowpass' : 'highpass';
        f.frequency.value = i % 8 === 0 ? 200 : 5000;
        const g = this.ctx.createGain();
        this.env(g, t, 0.005, i % 8 === 0 ? 0.45 : 0.14, 0.08);
        s.connect(f); f.connect(g); g.connect(this.musicGain);
        s.start(t); s.stop(t + 0.1);
      }
      this.step++; this.nextTime += spb;
    }
  },
};
try { Audio2.muted = localStorage.getItem('coliseo_mute') === '1'; } catch (e) {}

/* ================================================================ three: base */
const container = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = '<p style="padding:40px;text-align:center">Tu navegador no soporta WebGL 😢</p>';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9a86f, 26, 70);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 120);
const CAM_OFF = new THREE.Vector3(0, 6.9, 7.8);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 0.8 ? 62 : 50;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
camera.fov = window.innerWidth / window.innerHeight < 0.8 ? 62 : 50;
camera.updateProjectionMatrix();

/* luces */
scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x8a6a3a, 1.0));
const sun = new THREE.DirectionalLight(0xffe3b0, 1.5);
sun.position.set(-8, 14, 6);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404860, 0.5));

/* toon helpers */
const gradTex = (() => {
  const data = new Uint8Array([70, 130, 200, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = (color, opts = {}) =>
  new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, opts));

function addOutline(root, thickness = 0.045) {
  const outMat = new THREE.MeshBasicMaterial({ color: 0x0a0a14, side: THREE.BackSide });
  const add = [];
  root.traverse(m => {
    if (m.isMesh && !m.userData.noOutline) add.push(m);
  });
  for (const m of add) {
    const o = new THREE.Mesh(m.geometry, outMat);
    o.userData.noOutline = true;
    const s = m.userData.outlineScale || (1 + thickness);
    o.scale.setScalar(s);
    o.raycast = () => {};
    m.add(o);
  }
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ================================================================ arena */
function buildArena() {
  const g = new THREE.Group();

  // cielo: cúpula degradada dorada→azul
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 20, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vP=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){ float h=clamp(vP.y/90.0,0.0,1.0);
          vec3 top=vec3(0.20,0.38,0.72), mid=vec3(0.55,0.62,0.85), low=vec3(1.0,0.82,0.55);
          vec3 c=mix(low,mix(mid,top,smoothstep(0.18,0.7,h)),smoothstep(0.0,0.22,h));
          gl_FragColor=vec4(c,1.0); }`,
    })
  );
  g.add(sky);

  // suelo de arena con anillos y emblema central
  const floorTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#d7b26c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = `rgba(${120 + Math.random() * 80 | 0},${90 + Math.random() * 60 | 0},40,${Math.random() * 0.14})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2.4, 2.4);
    }
    x.strokeStyle = 'rgba(140,100,40,0.5)'; x.lineWidth = 7;
    for (const r of [150, 260, 380, 470]) {
      x.beginPath(); x.arc(w / 2, h / 2, r, 0, TAU); x.stroke();
    }
    // emblema: sol/estrella dorada
    x.save(); x.translate(w / 2, h / 2);
    x.fillStyle = 'rgba(214,164,50,0.85)';
    x.beginPath(); x.arc(0, 0, 90, 0, TAU); x.fill();
    x.fillStyle = '#d7b26c';
    x.beginPath(); x.arc(0, 0, 70, 0, TAU); x.fill();
    x.fillStyle = 'rgba(214,164,50,0.9)';
    for (let i = 0; i < 8; i++) {
      x.rotate(TAU / 8);
      x.beginPath(); x.moveTo(0, -28); x.lineTo(12, -66); x.lineTo(-12, -66); x.closePath(); x.fill();
    }
    x.beginPath(); x.arc(0, 0, 24, 0, TAU); x.fill();
    x.restore();
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(13, 48), toon(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  // muro interior
  const brickTex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#c8ad7d'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(90,70,40,0.45)'; x.lineWidth = 4;
    const bh = 42;
    for (let r = 0; r * bh < h + bh; r++) {
      const y = r * bh;
      x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
      const off = r % 2 ? 64 : 0;
      for (let c = 0; c * 128 < w + 128; c++) {
        x.beginPath(); x.moveTo(c * 128 + off, y); x.lineTo(c * 128 + off, y + bh); x.stroke();
      }
    }
  });
  brickTex.wrapS = THREE.RepeatWrapping; brickTex.repeat.x = 10;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(13.6, 13.6, 3.4, 48, 1, true),
    toon(0xffffff, { map: brickTex, side: THREE.BackSide })
  );
  wall.position.y = 1.7;
  g.add(wall);

  // cornisa dorada
  const trim = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.22, 8, 48), toon(0xd6a432));
  trim.rotation.x = Math.PI / 2; trim.position.y = 3.4;
  g.add(trim);

  // gradas superiores (silueta)
  const stands = new THREE.Mesh(
    new THREE.CylinderGeometry(19, 15, 6, 40, 1, true),
    toon(0x8c744e, { side: THREE.BackSide })
  );
  stands.position.y = 6.2;
  g.add(stands);
  const standsTop = new THREE.Mesh(new THREE.TorusGeometry(19, 0.35, 8, 40), toon(0x6e5a3c));
  standsTop.rotation.x = Math.PI / 2; standsTop.position.y = 9.2;
  g.add(standsTop);

  // público: puntitos de color que "animan" en las gradas
  {
    const N = 260, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const palette = [0xffe0b0, 0xb0c8ff, 0xffb0c0, 0xc8ffb0, 0xe6cfff];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rand(0, TAU), r = rand(15.6, 18.4);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(4.4, 8.6);
      pos[i * 3 + 2] = Math.sin(a) * r;
      c.setHex(palette[i % palette.length]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const crowd = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.34, vertexColors: true, sizeAttenuation: true,
    }));
    crowd.userData.baseY = pos.slice();
    g.add(crowd);
    g.userData.crowd = crowd;
  }

  // columnas
  const colMat = toon(0xd9c69a), capMat = toon(0xbfa878);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.31;
    const col = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6.4, 10), colMat);
    shaft.position.y = 3.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), capMat);
    base.position.y = 0.25;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), capMat);
    cap.position.y = 6.4;
    col.add(shaft, base, cap);
    col.position.set(Math.cos(a) * 14.6, 0, Math.sin(a) * 14.6);
    g.add(col);
  }

  // estandartes rojos con emblema
  const bannerTex = canvasTex(256, 384, (x, w, h) => {
    x.fillStyle = '#9c2f34'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d6a432'; x.lineWidth = 14; x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = '#d6a432';
    x.save(); x.translate(w / 2, h / 2 - 20);
    x.beginPath(); x.arc(0, 0, 56, 0, TAU); x.fill();
    x.fillStyle = '#9c2f34'; x.beginPath(); x.arc(0, 0, 42, 0, TAU); x.fill();
    x.fillStyle = '#d6a432';
    x.beginPath(); // rayo estilizado
    x.moveTo(-8, -34); x.lineTo(14, -6); x.lineTo(2, -2); x.lineTo(12, 30);
    x.lineTo(-14, 0); x.lineTo(-2, -4); x.closePath(); x.fill();
    x.restore();
    x.fillStyle = '#d6a432';
    x.beginPath(); x.moveTo(0, h); x.lineTo(w / 2, h - 46); x.lineTo(w, h); x.closePath();
    x.fillStyle = '#7d2226'; x.fill();
  });
  const banners = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.95;
    const b = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.6, 1, 6),
      new THREE.MeshToonMaterial({ map: bannerTex, gradientMap: gradTex, side: THREE.DoubleSide })
    );
    b.position.set(Math.cos(a) * 13.25, 2.1, Math.sin(a) * 13.25);
    b.lookAt(0, 2.1, 0);
    b.userData.phase = rand(0, TAU);
    banners.push(b);
    g.add(b);
  }
  g.userData.banners = banners;

  // puerta del torneo
  const gate = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4.6, 1), toon(0xbfa878));
  arch.position.y = 2.3;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshBasicMaterial({ color: 0x120e18 }));
  hole.position.set(0, 1.6, -0.52);
  hole.rotation.y = Math.PI;
  const hole2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.7), new THREE.MeshBasicMaterial({ color: 0x120e18 }));
  hole2.position.set(0, 0.85, -0.52); hole2.rotation.y = Math.PI;
  gate.add(arch, hole, hole2);
  const gateTop = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), toon(0xd6a432));
  gateTop.position.y = 5.4; gateTop.rotation.y = Math.PI / 4;
  gate.add(gateTop);
  gate.position.set(0, 0, -13.1);
  g.add(gate);

  // estatuas doradas de guerreros a los lados de la puerta
  for (const sx of [-1, 1]) {
    const st = new THREE.Group();
    const gold = toon(0xcfa13a);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 8), gold);
    body.position.y = 1.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), gold);
    head.position.y = 3.5;
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 8), gold);
    helm.position.y = 4.05;
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), gold);
    sword.position.set(sx * 0.9, 2.4, 0.3);
    sword.rotation.z = sx * -0.5;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.7), toon(0xbfa878));
    ped.position.y = 0.3;
    st.add(ped, body, head, helm, sword);
    st.position.set(sx * 4.6, 0, -12.4);
    g.add(st);
  }

  // braseros con fuego
  const braziers = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const br = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.5, 8), toon(0x5a4632));
    stem.position.y = 0.75;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.28, 0.45, 10), toon(0x6e5a3c));
    bowl.position.y = 1.6;
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8c30 }));
    ember.position.y = 1.82;
    ember.userData.noOutline = true;
    br.add(stem, bowl, ember);
    br.position.set(Math.cos(a) * 11.6, 0, Math.sin(a) * 11.6);
    braziers.push(br);
    g.add(br);
  }
  g.userData.braziers = braziers;

  scene.add(g);
  return g;
}
const arena = buildArena();

/* ================================================================ partículas (Points pool) */
const PMAX = 800;
const Particles = {
  px: new Float32Array(PMAX), py: new Float32Array(PMAX), pz: new Float32Array(PMAX),
  vx: new Float32Array(PMAX), vy: new Float32Array(PMAX), vz: new Float32Array(PMAX),
  life: new Float32Array(PMAX), max: new Float32Array(PMAX),
  size: new Float32Array(PMAX), grav: new Float32Array(PMAX), drag: new Float32Array(PMAX),
  cr: new Float32Array(PMAX), cg: new Float32Array(PMAX), cb: new Float32Array(PMAX),
  cursor: 0, geo: null, points: null,
  aPos: null, aCol: null, aSize: null, aAlpha: null,
  init() {
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3);
    this.aCol = new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(PMAX), 1);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(PMAX), 1);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('pcolor', this.aCol);
    this.geo.setAttribute('psize', this.aSize);
    this.geo.setAttribute('palpha', this.aAlpha);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha;
        varying vec3 vC; varying float vA;
        void main(){ vC=pcolor; vA=palpha;
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=psize*(260.0/max(1.0,-mv.z));
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d=length(gl_PointCoord-0.5);
          float a=smoothstep(0.5,0.05,d)*vA;
          gl_FragColor=vec4(vC*a,a); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    for (let i = 0; i < PMAX; i++) { this.py[i] = -100; this.life[i] = 0; }
    scene.add(this.points);
  },
  spawn(pos, vel, color, size, life, grav = 0, drag = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % PMAX;
    this.px[i] = pos.x; this.py[i] = pos.y; this.pz[i] = pos.z;
    this.vx[i] = vel.x; this.vy[i] = vel.y; this.vz[i] = vel.z;
    this.life[i] = life; this.max[i] = life;
    this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.cr[i] = color.r; this.cg[i] = color.g; this.cb[i] = color.b;
  },
  burst(pos, hex, n, speed, size, life, grav = 0, up = 0.5) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), el = rand(-0.3, 1) * up;
      const sp = speed * rand(0.35, 1);
      this.spawn(pos,
        { x: Math.cos(a) * sp, y: el * speed + rand(0, speed * 0.4), z: Math.sin(a) * sp },
        c, size * rand(0.6, 1.3), life * rand(0.6, 1.2), grav, 2.2);
    }
  },
  update(dt) {
    for (let i = 0; i < PMAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.py[i] = -100; this.aAlpha.array[i] = 0; continue; }
      const dr = 1 - this.drag[i] * dt;
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      const t = this.life[i] / this.max[i];
      this.aPos.array[i * 3] = this.px[i];
      this.aPos.array[i * 3 + 1] = this.py[i];
      this.aPos.array[i * 3 + 2] = this.pz[i];
      this.aCol.array[i * 3] = this.cr[i];
      this.aCol.array[i * 3 + 1] = this.cg[i];
      this.aCol.array[i * 3 + 2] = this.cb[i];
      this.aSize.array[i] = this.size[i];
      this.aAlpha.array[i] = clamp(t * 1.6, 0, 1);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  },
};
Particles.init();

/* corazones al derrotar enemigos (guiño KH) */
const heartTex = canvasTex(64, 64, (x) => {
  x.fillStyle = '#ff9ad5';
  x.beginPath();
  x.moveTo(32, 56);
  x.bezierCurveTo(6, 36, 6, 14, 22, 12);
  x.bezierCurveTo(29, 11, 32, 18, 32, 22);
  x.bezierCurveTo(32, 18, 35, 11, 42, 12);
  x.bezierCurveTo(58, 14, 58, 36, 32, 56);
  x.fill();
});
const hearts = [];
function spawnHeart(pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: heartTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.position.copy(pos); s.position.y += 0.6;
  s.scale.setScalar(0.55);
  s.userData = { life: 1.4, wob: rand(0, TAU) };
  scene.add(s); hearts.push(s);
  Audio2.heart();
}
function updateHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i], u = h.userData;
    u.life -= dt;
    h.position.y += 1.6 * dt;
    h.position.x += Math.sin(u.life * 6 + u.wob) * 0.3 * dt;
    h.material.opacity = clamp(u.life, 0, 1);
    if (u.life <= 0) { scene.remove(h); h.material.dispose(); hearts.splice(i, 1); }
  }
}

/* sombras circulares bajo personajes */
const blobGeo = new THREE.CircleGeometry(1, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
function makeBlob(r) {
  const b = new THREE.Mesh(blobGeo, blobMat);
  b.rotation.x = -Math.PI / 2;
  b.position.y = 0.02;
  b.scale.setScalar(r);
  b.userData.noOutline = true;
  return b;
}

/* ================================================================ números de daño */
const dmgPool = [];
for (let i = 0; i < 26; i++) {
  const el = document.createElement('div');
  el.className = 'dmg';
  el.style.display = 'none';
  $('hud').appendChild(el);
  dmgPool.push({ el, life: 0, pos: new THREE.Vector3(), vy: 0 });
}
function showDmg(pos, txt, color = '#fff', big = false) {
  let d = dmgPool.find(d => d.life <= 0);
  if (!d) d = dmgPool[0];
  d.life = 0.8;
  d.pos.copy(pos); d.pos.y += rand(1.2, 1.5); d.pos.x += rand(-0.3, 0.3);
  d.vy = 2.2;
  d.el.textContent = txt;
  d.el.style.color = color;
  d.el.style.fontSize = big ? '28px' : '19px';
  d.el.style.display = 'block';
}
const _v = new THREE.Vector3();
function updateDmg(dt) {
  for (const d of dmgPool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { d.el.style.display = 'none'; continue; }
    d.pos.y += d.vy * dt; d.vy *= 0.9;
    _v.copy(d.pos).project(camera);
    d.el.style.left = ((_v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    d.el.style.top = ((-_v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    d.el.style.opacity = clamp(d.life / 0.35, 0, 1);
  }
}

/* ================================================================ héroe */
function buildHero() {
  const root = new THREE.Group();
  const rig = new THREE.Group(); // lo que rueda/inclina
  root.add(rig);

  const skin = toon(0xf2c9a0), red = toon(0xc0303c), navy = toon(0x2b3a8c),
    shoe = toon(0xe8b23a), hairM = toon(0x6b4526), white = toon(0xf2f2f2);

  // piernas
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, sx] of [[legL, -1], [legR, 1]]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.34, 8), navy);
    thigh.position.y = -0.17;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), shoe);
    foot.scale.set(1, 0.7, 1.6);
    foot.position.set(0, -0.36, 0.05);
    leg.add(thigh, foot);
    leg.position.set(sx * 0.12, 0.44, 0);
    rig.add(leg);
  }

  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), red);
  torso.position.y = 0.68;
  rig.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.245, 0.09, 10), toon(0x2a2a34));
  belt.position.y = 0.47;
  rig.add(belt);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), white);
  chest.scale.set(1.2, 1.4, 0.6);
  chest.position.set(0, 0.72, 0.14);
  rig.add(chest);

  // brazos
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, sx] of [[armL, -1], [armR, 1]]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.2, 8), red);
    sleeve.position.y = -0.1;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.22, 8), skin);
    fore.position.y = -0.3;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skin);
    hand.position.y = -0.44;
    arm.add(sleeve, fore, hand);
    arm.position.set(sx * 0.28, 0.9, 0);
    arm.rotation.z = sx * -0.15;
    rig.add(arm);
  }

  // cabeza grande estilo chibi
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  head.add(skull);
  // pelo de puntas
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, rand(0.28, 0.44), 6), hairM);
    const a = (i / 9) * TAU;
    sp.position.set(Math.cos(a) * 0.17, 0.2 + rand(0, 0.08), Math.sin(a) * 0.17 - 0.04);
    sp.rotation.x = Math.sin(a) * 0.9 - 0.15;
    sp.rotation.z = -Math.cos(a) * 0.9;
    head.add(sp);
  }
  const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 6), hairM);
  fringe.position.set(0, 0.14, 0.22); fringe.rotation.x = 1.0;
  head.add(fringe);
  // ojos
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x20242e }));
    eye.userData.noOutline = true;
    eye.scale.set(0.8, 1.3, 0.5);
    eye.position.set(sx * 0.11, 0.02, 0.27);
    head.add(eye);
  }
  head.position.y = 1.24;
  rig.add(head);

  // espada-llave en la mano derecha
  const key = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.85, 8), toon(0xcfd6e6));
  shaft.position.y = 0.42;
  const tipBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), toon(0xcfd6e6));
  tipBar.position.set(0.12, 0.78, 0);
  const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.07), toon(0xcfd6e6));
  tooth1.position.set(0.06, 0.9, 0);
  const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.07), toon(0xcfd6e6));
  tooth2.position.set(0.08, 0.74, 0);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12), toon(0xd6a432));
  guard.position.y = 0.02;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), toon(0x2a2a34));
  grip.position.y = -0.02;
  key.add(shaft, tipBar, tooth1, tooth2, guard, grip);
  key.position.set(0, -0.46, 0.06);
  key.rotation.x = Math.PI / 2 * 0.9; // apoyada hacia delante
  armR.add(key);
  const tip = new THREE.Object3D();
  tip.position.y = 0.95;
  key.add(tip);

  addOutline(root, 0.06);
  root.add(makeBlob(0.55));
  scene.add(root);
  return { root, rig, legL, legR, armL, armR, head, key, tip };
}

const hero = {
  m: buildHero(),
  pos: new THREE.Vector3(0, 0, 3),
  vel: new THREE.Vector3(),
  facing: 0,
  hp: 100, hpMax: 100, mp: 100, mpMax: 100,
  speed: 5.4,
  state: 'idle', // idle run attack dodge cast hurt dead
  attackStep: 0, attackT: 0, attackQueued: false, attackHitDone: false,
  dodgeT: 0, dodgeCd: 0, dodgeDir: new THREE.Vector3(0, 0, 1),
  castT: 0, castKind: null,
  invuln: 0, animT: 0,
  cds: { fire: 0, ice: 0, thunder: 0, cure: 0 },
  chain: 0, chainTimer: 0,
};

const MAGIC = {
  fire:    { cost: 10, cd: 1.1 },
  ice:     { cost: 12, cd: 1.8 },
  thunder: { cost: 18, cd: 3.5 },
  cure:    { cost: 30, cd: 5.0 },
};

/* ================================================================ enemigos */
const enemies = [];
const projectiles = [];
const orbs = [];
const shockwaves = [];
const bolts = [];

function uniqueToon(hex) { return toon(hex); }

function buildShadow() {
  const g = new THREE.Group();
  const bodyM = uniqueToon(0x2a2244);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyM);
  body.scale.set(1, 0.8, 1); body.position.y = 0.28;
  const headM = uniqueToon(0x332a52);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), headM);
  head.position.y = 0.62;
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 6), headM);
    ant.position.set(sx * 0.1, 0.9, -0.08);
    ant.rotation.z = sx * -0.5; ant.rotation.x = -0.5;
    g.add(ant);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    eye.userData.noOutline = true;
    eye.scale.set(1, 1.6, 0.6);
    eye.position.set(sx * 0.09, 0.62, 0.2);
    g.add(eye);
  }
  const armM = uniqueToon(0x2a2244);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.34, 6), armM);
    arm.position.set(sx * 0.3, 0.34, 0.06);
    arm.rotation.z = sx * 0.7;
    g.add(arm);
  }
  g.add(body, head);
  addOutline(g, 0.07);
  g.add(makeBlob(0.42));
  return { group: g, mats: [bodyM, headM, armM], body };
}

function buildWizard() {
  const g = new THREE.Group();
  const robeM = uniqueToon(0x9c3038);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.95, 10), robeM);
  robe.position.y = 0.75;
  const headM = uniqueToon(0x241a30);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), headM);
  head.position.y = 1.32;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 10), robeM);
  hat.position.y = 1.6;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 12), robeM);
  brim.rotation.x = Math.PI / 2; brim.position.y = 1.42;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    eye.userData.noOutline = true;
    eye.position.set(sx * 0.08, 1.34, 0.16);
    g.add(eye);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), robeM);
    hand.position.set(sx * 0.42, 0.9, 0.1);
    g.add(hand);
  }
  g.add(robe, head, hat, brim);
  addOutline(g, 0.07);
  g.add(makeBlob(0.4));
  return { group: g, mats: [robeM, headM] };
}

function buildBrute(scale = 1, gold = false) {
  const g = new THREE.Group();
  const armorM = uniqueToon(gold ? 0x8a6a1c : 0x3b3f7a);
  const darkM = uniqueToon(gold ? 0x4d3a10 : 0x23264a);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), armorM);
  body.scale.set(1, 1.1, 0.9); body.position.y = 0.85;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), darkM);
  belly.scale.set(1, 1.1, 0.7); belly.position.set(0, 0.8, 0.28);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), darkM);
  head.position.y = 1.62;
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 8), armorM);
  helm.position.y = 1.86;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshBasicMaterial({ color: gold ? 0xff5030 : 0xffd23d }));
    eye.userData.noOutline = true;
    eye.position.set(sx * 0.1, 1.64, 0.22);
    g.add(eye);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), armorM);
    shoulder.position.set(sx * 0.66, 1.28, 0);
    g.add(shoulder);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.7, 8), darkM);
    arm.position.set(sx * 0.72, 0.82, 0.05);
    g.add(arm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), armorM);
    fist.position.set(sx * 0.74, 0.42, 0.1);
    g.add(fist);
    if (gold) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), armorM);
      spike.position.set(sx * 0.66, 1.62, 0);
      spike.rotation.z = sx * -0.7;
      g.add(spike);
    }
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), darkM);
    leg.position.set(sx * 0.28, 0.25, 0);
    g.add(leg);
  }
  g.add(body, belly, head, helm);
  g.scale.setScalar(scale);
  addOutline(g, 0.05);
  g.add(makeBlob(0.85));
  return { group: g, mats: [armorM, darkM] };
}

const ENEMY_DEFS = {
  shadow: { hp: 30, dmg: 10, speed: 2.7, radius: 0.42, score: 50, build: buildShadow },
  wizard: { hp: 40, dmg: 12, speed: 2.2, radius: 0.45, score: 90, build: buildWizard },
  brute: { hp: 120, dmg: 18, speed: 1.5, radius: 0.85, score: 200, build: () => buildBrute(1, false) },
  boss: { hp: 430, dmg: 22, speed: 1.9, radius: 1.3, score: 1000, build: () => buildBrute(1.55, true) },
};

function spawnEnemy(type, pos, mods) {
  const def = ENEMY_DEFS[type];
  const built = def.build();
  const e = {
    type, def, group: built.group, mats: built.mats,
    pos: pos.clone(), hp: def.hp * mods.hp, hpMax: def.hp * mods.hp,
    dmg: def.dmg * mods.dmg, speed: def.speed * mods.speed,
    radius: def.radius,
    state: 'spawning', t: rand(0, 10), stateT: 0,
    frozen: 0, stun: 0, flash: 0, iceMesh: null,
    atkCd: rand(0.5, 1.5), summonAt: [0.66, 0.33],
    spawnT: 0.9,
  };
  e.group.position.copy(pos);
  e.group.scale.y = 0.01;
  scene.add(e.group);
  enemies.push(e);
  // charco oscuro de aparición
  Particles.burst(pos, 0x6a4a9c, 14, 2, 0.5, 0.6, -2, 1);
  return e;
}

function freezeEnemy(e, dur) {
  e.frozen = Math.max(e.frozen, dur);
  if (!e.iceMesh) {
    const ice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(e.radius + 0.35, 0),
      new THREE.MeshToonMaterial({
        color: 0xaee2ff, gradientMap: gradTex, transparent: true, opacity: 0.55,
      })
    );
    ice.position.y = e.radius + 0.2;
    ice.userData.noOutline = true;
    e.group.add(ice);
    e.iceMesh = ice;
  }
}

function damageEnemy(e, amount, srcPos, big = false) {
  if (e.state === 'dying' || e.state === 'spawning') return;
  e.hp -= amount;
  e.flash = 0.12;
  for (const m of e.mats) m.emissive.setRGB(1, 1, 1);
  const kb = new THREE.Vector3().subVectors(e.pos, srcPos).setY(0).normalize()
    .multiplyScalar(e.type === 'boss' ? 0.06 : big ? 0.55 : 0.3);
  e.pos.add(kb);
  showDmg(e.pos, Math.round(amount), big ? '#ffe36b' : '#fff', big);
  Particles.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.6, e.pos.z), 0xfff0b0, big ? 14 : 7, 3.5, 0.5, 0.3, 4);
  big ? Audio2.hitBig() : Audio2.hit();
  hero.chain++; hero.chainTimer = 3;
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.state = 'dying'; e.stateT = 0;
  Game.score += e.def.score * (1 + Math.min(hero.chain, 20) * 0.02) | 0;
  spawnHeart(e.pos);
  Particles.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.5, e.pos.z), 0x9c6ade, 22, 4, 0.7, 0.7, 1.5);
  Particles.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.5, e.pos.z), 0x2a2140, 10, 2.5, 0.9, 0.5, 0);
  // orbes
  const n = e.type === 'boss' ? 14 : e.type === 'brute' ? 6 : rand(2, 4) | 0;
  for (let i = 0; i < n; i++) {
    const kind = Math.random() < 0.42 ? 'hp' : Math.random() < 0.55 ? 'mp' : 'pt';
    spawnOrb(e.pos, kind);
  }
}

function spawnOrb(pos, kind) {
  const color = kind === 'hp' ? 0x57e86b : kind === 'mp' ? 0x5aa7ff : 0xf5c542;
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(kind === 'pt' ? 0.1 : 0.13, 0),
    new THREE.MeshBasicMaterial({ color })
  );
  m.position.copy(pos); m.position.y += 0.5;
  scene.add(m);
  orbs.push({
    mesh: m, kind,
    vel: new THREE.Vector3(rand(-2, 2), rand(2.5, 4.5), rand(-2, 2)),
    life: 12, magnet: false,
  });
}

/* ================================================================ magias */
function tryCast(kind) {
  if (Game.state !== 'playing' || hero.state === 'dead') return;
  const def = MAGIC[kind];
  if (hero.cds[kind] > 0 || hero.mp < def.cost) return;
  if (hero.state === 'attack' || hero.state === 'cast') return;
  hero.mp -= def.cost;
  hero.cds[kind] = def.cd;
  hero.state = 'cast'; hero.castT = 0; hero.castKind = kind;
  const target = nearestEnemy(12);
  if (target) hero.facing = Math.atan2(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
  navigator.vibrate && navigator.vibrate(18);
}

function releaseCast(kind) {
  const from = new THREE.Vector3(hero.pos.x, 1.1, hero.pos.z);
  const dir = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const target = nearestEnemy(14);

  if (kind === 'fire') {
    Audio2.fire();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9030 }));
    m.position.copy(from).addScaledVector(dir, 0.6);
    scene.add(m);
    projectiles.push({
      mesh: m, kind: 'fire', from: 'hero', dmg: 24, life: 3,
      vel: dir.clone().multiplyScalar(11), target, r: 0.35,
    });
  } else if (kind === 'ice') {
    Audio2.ice();
    for (let i = -1; i <= 1; i++) {
      const a = hero.facing + i * 0.22;
      const d2 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 6),
        new THREE.MeshBasicMaterial({ color: 0xbfeaff }));
      m.position.copy(from).addScaledVector(d2, 0.6);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
      scene.add(m);
      projectiles.push({
        mesh: m, kind: 'ice', from: 'hero', dmg: 15, life: 1.6,
        vel: d2.multiplyScalar(13), pierce: true, hitSet: new Set(), r: 0.4,
      });
    }
  } else if (kind === 'thunder') {
    Audio2.thunder();
    shake(0.5);
    flash(0.35);
    const targets = enemies.filter(e =>
      e.state !== 'dying' && e.state !== 'spawning' && e.pos.distanceTo(hero.pos) < 7.5).slice(0, 7);
    if (targets.length === 0) {
      spawnBolt(new THREE.Vector3(hero.pos.x + dir.x * 3, 0, hero.pos.z + dir.z * 3));
    }
    targets.forEach((e, i) => {
      setTimeout(() => {
        if (e.state === 'dying') return;
        spawnBolt(e.pos.clone());
        damageEnemy(e, 30, e.pos.clone().add(new THREE.Vector3(0.1, 0, 0)), true);
        e.stun = Math.max(e.stun, 0.9);
      }, i * 90);
    });
  } else if (kind === 'cure') {
    Audio2.cure();
    const heal = 45;
    hero.hp = Math.min(hero.hpMax, hero.hp + heal);
    showDmg(hero.pos, '+' + heal, '#7bf58b', true);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0x6bf07c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(hero.pos.x, 0.06, hero.pos.z);
    scene.add(ring);
    shockwaves.push({ mesh: ring, r: 0.5, speed: 3.2, life: 0.8, dmg: 0, from: 'fx' });
    for (let i = 0; i < 26; i++) {
      Particles.spawn(
        new THREE.Vector3(hero.pos.x + rand(-0.7, 0.7), 0.2, hero.pos.z + rand(-0.7, 0.7)),
        { x: rand(-0.3, 0.3), y: rand(1.5, 3), z: rand(-0.3, 0.3) },
        new THREE.Color(0x7bf58b), rand(0.4, 0.8), rand(0.7, 1.2), -0.5, 0.5);
    }
  }
}

function spawnBolt(at) {
  // rayo dentado desde el cielo (tres trazos paralelos para que luzca grueso)
  for (let k = 0; k < 3; k++) {
    const pts = [];
    const ox = rand(-0.12, 0.12), oz = rand(-0.12, 0.12);
    let x = at.x + rand(-0.6, 0.6), z = at.z + rand(-0.6, 0.6);
    for (let y = 9; y > 0; y -= 1.1) {
      pts.push(new THREE.Vector3(x + ox, y, z + oz));
      x += rand(-0.5, 0.5); z += rand(-0.5, 0.5);
      x = lerp(x, at.x, 0.25); z = lerp(z, at.z, 0.25);
    }
    pts.push(new THREE.Vector3(at.x + ox, 0, at.z + oz));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: k === 0 ? 0xffffff : 0xffe36b, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(line);
    bolts.push({ line, life: 0.28 + k * 0.05, max: 0.28 });
    // columna de chispas a lo largo del rayo
    for (const p of pts) {
      if (Math.random() < 0.5)
        Particles.spawn(p, { x: rand(-0.5, 0.5), y: rand(-0.5, 0.5), z: rand(-0.5, 0.5) },
          new THREE.Color(0xfff09b), 0.5, 0.2, 0, 0);
    }
  }
  Particles.burst(new THREE.Vector3(at.x, 0.3, at.z), 0xfff09b, 18, 4.5, 0.7, 0.4, 3);
}

/* ================================================================ efectos de cámara */
let shakeAmt = 0, freezeFrames = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function hitPause(t) { freezeFrames = Math.max(freezeFrames, t); }
function flash(op) {
  const f = $('flash');
  f.style.transition = 'none'; f.style.opacity = op;
  requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; });
}

/* ================================================================ input */
const input = {
  move: new THREE.Vector2(),
  stickId: null, stickCenter: { x: 0, y: 0 },
  keys: {},
};

const stickZone = $('stickZone'), stickBase = $('stickBase'), stickKnob = $('stickKnob');
stickZone.addEventListener('pointerdown', e => {
  if (input.stickId !== null) return;
  input.stickId = e.pointerId;
  input.stickCenter = { x: e.clientX, y: e.clientY };
  stickBase.style.display = stickKnob.style.display = 'block';
  stickBase.style.left = e.clientX + 'px'; stickBase.style.top = e.clientY + 'px';
  stickKnob.style.left = e.clientX + 'px'; stickKnob.style.top = e.clientY + 'px';
  stickZone.setPointerCapture(e.pointerId);
});
stickZone.addEventListener('pointermove', e => {
  if (e.pointerId !== input.stickId) return;
  let dx = e.clientX - input.stickCenter.x, dy = e.clientY - input.stickCenter.y;
  const len = Math.hypot(dx, dy), maxR = 46;
  if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
  stickKnob.style.left = (input.stickCenter.x + dx) + 'px';
  stickKnob.style.top = (input.stickCenter.y + dy) + 'px';
  input.move.set(dx / maxR, dy / maxR);
});
function stickEnd(e) {
  if (e.pointerId !== input.stickId) return;
  input.stickId = null;
  input.move.set(0, 0);
  stickBase.style.display = stickKnob.style.display = 'none';
}
stickZone.addEventListener('pointerup', stickEnd);
stickZone.addEventListener('pointercancel', stickEnd);

function bindBtn(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); Audio2.resume(); fn(); });
}
bindBtn('btnAtk', () => doAttack());
bindBtn('btnDodge', () => doDodge());
bindBtn('btnFire', () => tryCast('fire'));
bindBtn('btnIce', () => tryCast('ice'));
bindBtn('btnThunder', () => tryCast('thunder'));
bindBtn('btnCure', () => tryCast('cure'));

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  Audio2.resume();
  input.keys[e.key.toLowerCase()] = true;
  const k = e.key.toLowerCase();
  if (k === 'j' || k === ' ') doAttack();
  if (k === 'k' || k === 'shift') doDodge();
  if (k === '1') tryCast('fire');
  if (k === '2') tryCast('ice');
  if (k === '3') tryCast('thunder');
  if (k === '4') tryCast('cure');
  if (k === 'p' || k === 'escape') togglePause();
  if (k === 'm') toggleMute();
});
window.addEventListener('keyup', e => { input.keys[e.key.toLowerCase()] = false; });

function keysMove() {
  const k = input.keys;
  let x = 0, y = 0;
  if (k['a'] || k['arrowleft']) x -= 1;
  if (k['d'] || k['arrowright']) x += 1;
  if (k['w'] || k['arrowup']) y -= 1;
  if (k['s'] || k['arrowdown']) y += 1;
  return { x, y };
}

document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

/* ================================================================ acciones del héroe */
function nearestEnemy(maxDist) {
  let best = null, bd = maxDist;
  for (const e of enemies) {
    if (e.state === 'dying' || e.state === 'spawning') continue;
    const d = e.pos.distanceTo(hero.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function doAttack() {
  if (Game.state !== 'playing' || hero.state === 'dead' || hero.state === 'dodge' || hero.state === 'cast') return;
  if (hero.state === 'attack') {
    if (hero.attackT > 0.35) hero.attackQueued = true;
    return;
  }
  startAttackStep(0);
}
function startAttackStep(step) {
  hero.state = 'attack';
  hero.attackStep = step;
  hero.attackT = 0;
  hero.attackQueued = false;
  hero.attackHitDone = false;
  const t = nearestEnemy(7);
  if (t) hero.facing = Math.atan2(t.pos.x - hero.pos.x, t.pos.z - hero.pos.z);
  Audio2.swing();
}
function doDodge() {
  if (Game.state !== 'playing' || hero.state === 'dead' || hero.dodgeCd > 0 || hero.state === 'dodge') return;
  hero.state = 'dodge';
  hero.dodgeT = 0;
  hero.dodgeCd = 0.85;
  const mv = new THREE.Vector3(input.move.x, 0, input.move.y);
  const km = keysMove(); mv.x += km.x; mv.z += km.y;
  if (mv.lengthSq() > 0.04) mv.normalize();
  else mv.set(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  hero.dodgeDir.copy(mv);
  hero.facing = Math.atan2(mv.x, mv.z);
  Audio2.roll();
  navigator.vibrate && navigator.vibrate(10);
}

function damageHero(amount, srcPos) {
  if (hero.invuln > 0 || hero.state === 'dodge' || hero.state === 'dead') return;
  if (Game.state !== 'playing') return;
  hero.hp -= amount;
  hero.invuln = 0.9;
  hero.chain = 0;
  Game.roundClean = false;
  showDmg(hero.pos, Math.round(amount), '#ff6b6b', true);
  Audio2.hurt();
  shake(0.45);
  navigator.vibrate && navigator.vibrate([30, 40, 30]);
  const kb = new THREE.Vector3().subVectors(hero.pos, srcPos).setY(0).normalize().multiplyScalar(0.8);
  hero.pos.add(kb);
  $('vignette').style.opacity = 1;
  setTimeout(() => { $('vignette').style.opacity = 0; }, 350);
  if (hero.hp <= 0) { hero.hp = 0; heroDie(); }
}

function heroDie() {
  hero.state = 'dead';
  Audio2.stopMusic();
  Audio2.lose();
  Particles.burst(new THREE.Vector3(hero.pos.x, 1, hero.pos.z), 0xffffff, 30, 4, 0.6, 1.2, 2);
  setTimeout(() => {
    Game.state = 'lose';
    $('loseStats').innerHTML =
      `Copa: <b>${CUPS[Game.cup].name}</b> · Ronda <b>${Game.round + 1}</b><br/>Puntos: <b>${Game.score}</b>`;
    show('ovLose');
    $('hud').classList.remove('on');
  }, 1300);
}

/* ================================================================ copas y rondas */
const CUPS = [
  {
    name: 'Copa Céfiro', mods: { hp: 1, dmg: 1, speed: 1 },
    rounds: [
      { n: 'Sombras errantes', spawn: { shadow: 3 } },
      { n: 'El enjambre', spawn: { shadow: 5 } },
      { n: 'Fuego cruzado', spawn: { shadow: 3, wizard: 2 } },
      { n: 'La emboscada', spawn: { shadow: 5, wizard: 2 } },
      { n: 'La guardia pesada', spawn: { brute: 1, shadow: 3 } },
    ],
  },
  {
    name: 'Copa Pegaso', mods: { hp: 1.15, dmg: 1.1, speed: 1.18 },
    rounds: [
      { n: 'Vendaval', spawn: { shadow: 5 } },
      { n: 'Chispas', spawn: { shadow: 4, wizard: 2 } },
      { n: 'Muro de hierro', spawn: { brute: 1, wizard: 1, shadow: 2 } },
      { n: 'La marabunta', spawn: { shadow: 7, wizard: 1 } },
      { n: 'Dos torres', spawn: { brute: 2, shadow: 3 } },
      { n: 'Tormenta final', spawn: { brute: 1, wizard: 3, shadow: 3 } },
    ],
  },
  {
    name: 'Copa del Héroe', mods: { hp: 1.3, dmg: 1.25, speed: 1.25 },
    rounds: [
      { n: 'Bienvenida ardiente', spawn: { shadow: 5, wizard: 1 } },
      { n: 'Colmillos', spawn: { shadow: 6, wizard: 2 } },
      { n: 'Aplastadores', spawn: { brute: 2, wizard: 1 } },
      { n: 'Cielo en llamas', spawn: { wizard: 4, shadow: 4 } },
      { n: 'La horda', spawn: { shadow: 8, brute: 1 } },
      { n: 'Últimos fieles', spawn: { brute: 2, wizard: 2, shadow: 4 } },
      { n: 'El Guardián del Coliseo', spawn: { boss: 1 } },
    ],
  },
];

const Game = {
  state: 'title', // title playing announce paused win lose
  cup: 0, round: 0, score: 0, roundClean: true,
  spawnQueue: [], spawnTimer: 0, roundEndTimer: -1,
  time: 0,
};

function show(id) {
  for (const o of ['ovTitle', 'ovWin', 'ovLose', 'ovPause']) $(o).classList.remove('on');
  if (id) $(id).classList.add('on');
}

function bests() {
  const b = [];
  for (let i = 0; i < 3; i++) {
    try { b.push(parseInt(localStorage.getItem('coliseo_best' + i) || '0')); }
    catch (e) { b.push(0); }
  }
  return b;
}
function refreshTitle() {
  const b = bests();
  for (let i = 0; i < 3; i++) $('best' + i).textContent = b[i] ? 'Mejor\n' + b[i] : '';
  $('cup1').classList.toggle('locked', !b[0]);
  $('cup2').classList.toggle('locked', !b[1]);
}

function startCup(i) {
  Game.cup = i; Game.round = 0; Game.score = 0;
  hero.hp = hero.hpMax; hero.mp = hero.mpMax;
  hero.pos.set(0, 0, 3); hero.facing = Math.PI;
  hero.state = 'idle'; hero.invuln = 0; hero.chain = 0;
  for (const k in hero.cds) hero.cds[k] = 0;
  clearField();
  show(null);
  $('hud').classList.add('on');
  Audio2.resume();
  Audio2.startMusic();
  startRound(0);
}

function clearField() {
  for (const e of enemies) scene.remove(e.group);
  enemies.length = 0;
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const o of orbs) scene.remove(o.mesh);
  orbs.length = 0;
  for (const s of shockwaves) scene.remove(s.mesh);
  shockwaves.length = 0;
}

function startRound(r) {
  Game.round = r;
  Game.state = 'announce';
  Game.roundClean = true;
  const cup = CUPS[Game.cup];
  const round = cup.rounds[r];
  $('annTitle').textContent = r === cup.rounds.length - 1 ? '¡Ronda final!' : 'Ronda ' + (r + 1);
  $('annSub').textContent = round.n;
  const ann = $('announce');
  ann.classList.remove('on'); void ann.offsetWidth; ann.classList.add('on');
  $('roundTxt').textContent = (r + 1) + ' / ' + cup.rounds.length;
  Audio2.fanfare();
  // cola de aparición escalonada
  Game.spawnQueue = [];
  for (const [type, count] of Object.entries(round.spawn))
    for (let i = 0; i < count; i++) Game.spawnQueue.push(type);
  // baraja
  Game.spawnQueue.sort(() => Math.random() - 0.5);
  Game.spawnTimer = 1.5;
  Game.roundEndTimer = -1;
  setTimeout(() => { if (Game.state === 'announce') Game.state = 'playing'; }, 1200);
}

function spawnFromQueue() {
  const type = Game.spawnQueue.shift();
  const mods = CUPS[Game.cup].mods;
  let p;
  let tries = 0;
  do {
    const a = rand(0, TAU), r = rand(4, 10);
    p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    tries++;
  } while (p.distanceTo(hero.pos) < 3.5 && tries < 12);
  spawnEnemy(type, p, mods);
}

function winCup() {
  Game.state = 'win';
  Audio2.stopMusic();
  Audio2.fanfare();
  setTimeout(() => Audio2.fanfare(), 500);
  const noDmgBonus = Game.roundClean ? 150 : 0;
  Game.score += 300 + noDmgBonus;
  try {
    const key = 'coliseo_best' + Game.cup;
    const prev = parseInt(localStorage.getItem(key) || '0');
    if (Game.score > prev) localStorage.setItem(key, String(Game.score));
  } catch (e) {}
  $('winCup').textContent = CUPS[Game.cup].name;
  $('winStats').innerHTML =
    `Puntuación final: <b>${Game.score}</b><br/>PV restantes: <b>${Math.round(hero.hp)}</b>`;
  $('btnWinNext').textContent = Game.cup < 2 ? 'Siguiente copa' : 'Volver al coliseo';
  $('hud').classList.remove('on');
  show('ovWin');
}

/* menú/overlay handlers */
document.querySelectorAll('.cup').forEach(el => {
  el.addEventListener('click', () => {
    Audio2.resume(); Audio2.select();
    startCup(parseInt(el.dataset.cup));
  });
});
$('btnWinNext').addEventListener('click', () => {
  Audio2.select();
  if (Game.cup < 2) startCup(Game.cup + 1);
  else { Game.state = 'title'; refreshTitle(); show('ovTitle'); }
});
$('btnWinMenu').addEventListener('click', () => { Audio2.select(); Game.state = 'title'; refreshTitle(); show('ovTitle'); });
$('btnRetry').addEventListener('click', () => { Audio2.select(); startCup(Game.cup); });
$('btnLoseMenu').addEventListener('click', () => { Audio2.select(); Game.state = 'title'; refreshTitle(); show('ovTitle'); });
$('btnResume').addEventListener('click', () => togglePause());
$('btnPauseMenu').addEventListener('click', () => {
  Audio2.select(); Audio2.stopMusic();
  clearField();
  Game.state = 'title';
  $('hud').classList.remove('on');
  refreshTitle(); show('ovTitle');
});
$('btnPause').addEventListener('click', () => togglePause());
$('btnMute').addEventListener('click', () => toggleMute());

function togglePause() {
  if (Game.state === 'playing' || Game.state === 'announce') {
    Game.prevState = Game.state;
    Game.state = 'paused';
    show('ovPause');
  } else if (Game.state === 'paused') {
    Audio2.select();
    Game.state = Game.prevState || 'playing';
    show(null);
  }
}
function toggleMute() {
  Audio2.resume();
  Audio2.setMuted(!Audio2.muted);
  $('btnMute').textContent = Audio2.muted ? '✕' : '♪';
}
$('btnMute').textContent = Audio2.muted ? '✕' : '♪';

/* ================================================================ updates */
function updateHero(dt) {
  const m = hero.m;
  hero.animT += dt;
  for (const k in hero.cds) hero.cds[k] = Math.max(0, hero.cds[k] - dt);
  hero.dodgeCd = Math.max(0, hero.dodgeCd - dt);
  hero.invuln = Math.max(0, hero.invuln - dt);
  hero.mp = Math.min(hero.mpMax, hero.mp + 4.5 * dt);
  if (hero.chainTimer > 0) { hero.chainTimer -= dt; if (hero.chainTimer <= 0) hero.chain = 0; }

  if (hero.state === 'dead') {
    m.rig.rotation.x = lerp(m.rig.rotation.x, -Math.PI / 2, 5 * dt);
    m.root.position.copy(hero.pos);
    return;
  }

  // movimiento
  const mv = new THREE.Vector3(input.move.x, 0, input.move.y);
  const km = keysMove(); mv.x += km.x; mv.z += km.y;
  if (mv.length() > 1) mv.normalize();
  const moving = mv.lengthSq() > 0.03;

  if (hero.state === 'attack') {
    hero.attackT += dt / [0.34, 0.34, 0.52][hero.attackStep];
    const step = hero.attackStep;
    // pequeño avance en cada golpe
    hero.pos.x += Math.sin(hero.facing) * dt * (hero.attackT < 0.4 ? 3.2 : 0.4);
    hero.pos.z += Math.cos(hero.facing) * dt * (hero.attackT < 0.4 ? 3.2 : 0.4);
    // aplicar daño en el frame activo
    if (!hero.attackHitDone && hero.attackT > 0.42) {
      hero.attackHitDone = true;
      const dmg = [12, 12, 22][step];
      const arc = step === 2 ? Math.PI : 1.25;
      const reach = step === 2 ? 2.3 : 2.0;
      let hitAny = false;
      for (const e of enemies) {
        if (e.state === 'dying' || e.state === 'spawning') continue;
        const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > reach + e.radius) continue;
        let da = Math.atan2(dx, dz) - hero.facing;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > arc) continue;
        damageEnemy(e, dmg, hero.pos, step === 2);
        hitAny = true;
      }
      if (hitAny) { hitPause(step === 2 ? 0.09 : 0.05); shake(step === 2 ? 0.3 : 0.12); }
    }
    // estela del arma
    if (hero.attackT > 0.2 && hero.attackT < 0.75) {
      const tp = new THREE.Vector3();
      m.tip.getWorldPosition(tp);
      Particles.spawn(tp, { x: 0, y: 0, z: 0 }, new THREE.Color(0xfff2c0), 0.7, 0.16, 0, 0);
    }
    if (hero.attackT >= 1) {
      if (hero.attackQueued && hero.attackStep < 2) startAttackStep(hero.attackStep + 1);
      else hero.state = moving ? 'run' : 'idle';
    }
  } else if (hero.state === 'dodge') {
    hero.dodgeT += dt;
    hero.pos.addScaledVector(hero.dodgeDir, 10 * dt * (1 - hero.dodgeT / 0.5));
    if (hero.dodgeT > 0.45) { hero.state = moving ? 'run' : 'idle'; m.rig.rotation.x = 0; }
  } else if (hero.state === 'cast') {
    hero.castT += dt;
    if (hero.castT > 0.18 && hero.castKind) {
      releaseCast(hero.castKind);
      hero.castKind = null;
    }
    if (hero.castT > 0.4) hero.state = moving ? 'run' : 'idle';
  } else {
    if (moving) {
      hero.state = 'run';
      hero.pos.addScaledVector(mv, hero.speed * dt);
      hero.facing = angleLerp(hero.facing, Math.atan2(mv.x, mv.z), 14 * dt);
    } else hero.state = 'idle';
  }

  // límites de la arena
  const rr = Math.hypot(hero.pos.x, hero.pos.z);
  if (rr > 12) { hero.pos.x *= 12 / rr; hero.pos.z *= 12 / rr; }

  /* --------- animación procedural --------- */
  m.root.position.copy(hero.pos);
  m.root.rotation.y = hero.facing;
  const t = hero.animT;
  if (hero.state === 'dodge') {
    m.rig.rotation.x = (hero.dodgeT / 0.45) * TAU;
    m.rig.position.y = Math.sin((hero.dodgeT / 0.45) * Math.PI) * 0.25;
  } else if (hero.state === 'attack') {
    m.rig.rotation.x = 0.12;
    m.rig.position.y = 0;
    const p = hero.attackT;
    const sw = Math.sin(clamp((p - 0.15) / 0.5, 0, 1) * Math.PI);
    if (hero.attackStep === 0) {
      m.armR.rotation.set(-2.5 + sw * 2.9, 0, -0.4 + sw * 0.9);
      m.rig.rotation.y = -0.5 + sw * 1.0;
    } else if (hero.attackStep === 1) {
      m.armR.rotation.set(-2.2 + sw * 2.6, 0, 0.7 - sw * 1.4);
      m.rig.rotation.y = 0.5 - sw * 1.0;
    } else {
      m.armR.rotation.set(-1.5 + sw * 1.2, 0, -1.4);
      m.rig.rotation.y = p * TAU; // giro completo
    }
    m.armL.rotation.set(sw * 0.8 - 0.3, 0, 0.3);
    m.legL.rotation.x = 0.3; m.legR.rotation.x = -0.3;
  } else if (hero.state === 'cast') {
    m.rig.rotation.x = -0.06;
    m.rig.rotation.y = 0;
    const p = clamp(hero.castT / 0.35, 0, 1);
    m.armR.rotation.set(-2.9 * Math.sin(p * Math.PI * 0.6) - 0.2, 0, 0);
    m.armL.rotation.set(-0.4, 0, 0.4);
    const tp = new THREE.Vector3();
    m.tip.getWorldPosition(tp);
    const cc = { fire: 0xff8030, ice: 0x9fdcff, thunder: 0xffe36b, cure: 0x7bf58b }[hero.castKind || 'fire'];
    Particles.spawn(tp, { x: rand(-0.5, 0.5), y: rand(0.5, 1.5), z: rand(-0.5, 0.5) },
      new THREE.Color(cc), 0.6, 0.3, 0, 0);
  } else if (hero.state === 'run') {
    m.rig.rotation.x = 0.14;
    m.rig.rotation.y = 0;
    const w = t * 11;
    m.rig.position.y = Math.abs(Math.sin(w)) * 0.06;
    m.legL.rotation.x = Math.sin(w) * 0.9;
    m.legR.rotation.x = -Math.sin(w) * 0.9;
    m.armL.rotation.x = -Math.sin(w) * 0.7;
    m.armR.rotation.set(-Math.sin(w + Math.PI) * 0.5 - 0.3, 0, -0.2);
  } else {
    m.rig.rotation.x = 0;
    m.rig.rotation.y = 0;
    m.rig.position.y = Math.sin(t * 2.2) * 0.03;
    m.legL.rotation.x = m.legR.rotation.x = 0;
    m.armL.rotation.set(Math.sin(t * 2.2) * 0.06, 0, 0.15);
    m.armR.rotation.set(Math.sin(t * 2.2 + 1) * 0.06, 0, -0.15);
  }
  // parpadeo de invulnerabilidad
  m.root.visible = hero.invuln <= 0 || Math.floor(hero.invuln * 12) % 2 === 0;
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    if (e.flash > 0) {
      e.flash -= dt;
      if (e.flash <= 0) for (const m of e.mats) m.emissive.setRGB(0, 0, 0);
    }

    if (e.state === 'spawning') {
      e.spawnT -= dt;
      e.group.scale.y = lerp(e.group.scale.y, e.type === 'boss' ? 1.55 : 1, 6 * dt);
      if (e.spawnT <= 0) { e.state = 'idle'; e.group.scale.y = e.type === 'boss' ? 1.55 : 1; }
      e.group.position.copy(e.pos);
      continue;
    }
    if (e.state === 'dying') {
      e.stateT += dt;
      e.group.scale.multiplyScalar(1 - 3 * dt);
      e.group.position.y -= 0.6 * dt;
      if (e.stateT > 0.4) { scene.remove(e.group); enemies.splice(i, 1); }
      continue;
    }

    if (e.frozen > 0) {
      e.frozen -= dt;
      if (e.iceMesh) e.iceMesh.visible = true;
      if (e.frozen <= 0 && e.iceMesh) {
        e.group.remove(e.iceMesh); e.iceMesh = null;
        Particles.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.5, e.pos.z), 0xbfeaff, 10, 3, 0.5, 0.5, 3);
      }
      e.group.position.copy(e.pos);
      continue;
    }
    if (e.stun > 0) {
      e.stun -= dt;
      e.group.position.copy(e.pos);
      e.group.rotation.z = Math.sin(e.t * 30) * 0.06;
      continue;
    }
    e.group.rotation.z = 0;

    const toHero = new THREE.Vector3().subVectors(hero.pos, e.pos).setY(0);
    const dist = toHero.length();
    toHero.normalize();
    e.atkCd = Math.max(0, e.atkCd - dt);

    if (e.type === 'shadow') {
      // acecha y se abalanza
      if (e.state === 'windup') {
        e.stateT += dt;
        e.group.position.y = Math.sin(e.stateT * 20) * 0.04;
        if (e.stateT > 0.45) {
          e.state = 'lunge'; e.stateT = 0;
          e.lungeDir = toHero.clone();
          Audio2.swing();
        }
      } else if (e.state === 'lunge') {
        e.stateT += dt;
        e.pos.addScaledVector(e.lungeDir, 8 * dt);
        if (dist < e.radius + 0.5) damageHero(e.dmg, e.pos);
        if (e.stateT > 0.35) { e.state = 'idle'; e.atkCd = rand(1.2, 2.2); }
      } else {
        if (dist > 1.4) e.pos.addScaledVector(toHero, e.speed * dt);
        if (dist < 2.2 && e.atkCd <= 0) { e.state = 'windup'; e.stateT = 0; }
        // andar ondulante
        const wob = Math.sin(e.t * 10);
        e.group.scale.x = 1 + wob * 0.06;
        e.group.scale.z = 1 - wob * 0.06;
      }
      if (dist < e.radius + 0.35) damageHero(e.dmg * 0.6, e.pos);
    } else if (e.type === 'wizard') {
      // mantiene distancia y dispara
      const want = 6.5;
      if (dist < want - 1) e.pos.addScaledVector(toHero, -e.speed * dt);
      else if (dist > want + 1.5) e.pos.addScaledVector(toHero, e.speed * dt);
      // órbita lenta
      const orb2 = new THREE.Vector3(-toHero.z, 0, toHero.x);
      e.pos.addScaledVector(orb2, Math.sin(e.t * 0.7) * e.speed * 0.5 * dt);
      e.group.position.y = 0.25 + Math.sin(e.t * 3) * 0.12;
      if (e.atkCd <= 0 && Game.state === 'playing') {
        e.atkCd = rand(2.2, 3.4);
        const from = new THREE.Vector3(e.pos.x, 1.2 + e.group.position.y, e.pos.z);
        const dir = new THREE.Vector3().subVectors(
          new THREE.Vector3(hero.pos.x, 0.9, hero.pos.z), from).normalize();
        const mMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff7030 }));
        mMesh.position.copy(from);
        scene.add(mMesh);
        projectiles.push({ mesh: mMesh, kind: 'efire', from: 'enemy', dmg: e.dmg, life: 4, vel: dir.multiplyScalar(6.5), r: 0.4 });
        Audio2.fire();
      }
    } else { // brute / boss
      const isBoss = e.type === 'boss';
      if (e.state === 'slam') {
        e.stateT += dt;
        if (e.stateT > 0.55 && !e.slammed) {
          e.slammed = true;
          Audio2.explode(); shake(0.5);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.3, 0.7, 32),
            new THREE.MeshBasicMaterial({ color: isBoss ? 0xffb040 : 0x9fb4ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(e.pos.x, 0.05, e.pos.z);
          scene.add(ring);
          shockwaves.push({ mesh: ring, r: 0.5, speed: isBoss ? 7 : 5.5, life: 0.8, dmg: e.dmg, from: 'enemy', hit: false });
          Particles.burst(new THREE.Vector3(e.pos.x, 0.3, e.pos.z), 0xd7b26c, 20, 5, 0.7, 0.5, 4);
        }
        if (e.stateT > 1.1) { e.state = 'idle'; e.slammed = false; e.atkCd = rand(1.6, 2.6); }
      } else if (e.state === 'charge') {
        e.stateT += dt;
        if (e.stateT < 0.6) {
          // apuntar
          e.chargeDir = toHero.clone();
          e.group.rotation.y = Math.atan2(toHero.x, toHero.z);
        } else if (e.stateT < 1.5) {
          e.pos.addScaledVector(e.chargeDir, 9 * dt);
          Particles.spawn(new THREE.Vector3(e.pos.x, 0.3, e.pos.z),
            { x: rand(-1, 1), y: rand(1, 2), z: rand(-1, 1) },
            new THREE.Color(0xd7b26c), 0.6, 0.4, 3, 0);
          if (dist < e.radius + 0.6) { damageHero(e.dmg, e.pos); e.stateT = 1.5; }
        } else { e.state = 'idle'; e.atkCd = rand(1.4, 2.2); }
      } else {
        if (dist > 1.8) e.pos.addScaledVector(toHero, e.speed * dt);
        e.group.position.y = Math.abs(Math.sin(e.t * 4)) * 0.05;
        if (e.atkCd <= 0) {
          if (isBoss && dist > 4.5) { e.state = 'charge'; e.stateT = 0; }
          else if (dist < (isBoss ? 3.4 : 2.6)) {
            e.state = 'slam'; e.stateT = 0; e.slammed = false;
          }
        }
      }
      if (isBoss) {
        // invocar sombras a 2/3 y 1/3 de vida
        for (let s = e.summonAt.length - 1; s >= 0; s--) {
          if (e.hp / e.hpMax < e.summonAt[s]) {
            e.summonAt.splice(s, 1);
            for (let k = 0; k < 3; k++) {
              const a = rand(0, TAU);
              spawnEnemy('shadow', new THREE.Vector3(
                e.pos.x + Math.cos(a) * 2, 0, e.pos.z + Math.sin(a) * 2), CUPS[Game.cup].mods);
            }
          }
        }
      }
      if (dist < e.radius + 0.3) damageHero(e.dmg * 0.5, e.pos);
    }

    // límites y colocación
    const rr = Math.hypot(e.pos.x, e.pos.z);
    if (rr > 12.2) { e.pos.x *= 12.2 / rr; e.pos.z *= 12.2 / rr; }
    e.group.position.x = e.pos.x; e.group.position.z = e.pos.z;
    if (e.type !== 'wizard' && e.state !== 'charge')
      e.group.rotation.y = angleLerp(e.group.rotation.y, Math.atan2(toHero.x, toHero.z), 6 * dt);
    else if (e.type === 'wizard')
      e.group.rotation.y = Math.atan2(toHero.x, toHero.z);
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.kind === 'fire' && p.target && p.target.state !== 'dying') {
      // ligero guiado
      const want = new THREE.Vector3(p.target.pos.x, 0.9, p.target.pos.z).sub(p.mesh.position).normalize().multiplyScalar(11);
      p.vel.lerp(want, 4 * dt);
    }
    p.mesh.position.addScaledVector(p.vel, dt);
    // estela
    const trailC = p.kind === 'ice' ? 0x9fdcff : 0xff9030;
    Particles.spawn(p.mesh.position,
      { x: rand(-0.4, 0.4), y: rand(-0.2, 0.6), z: rand(-0.4, 0.4) },
      new THREE.Color(trailC), 0.55, 0.25, 0, 0);

    let dead = p.life <= 0;
    const pr = Math.hypot(p.mesh.position.x, p.mesh.position.z);
    if (pr > 12.8) dead = true;

    if (!dead && p.from === 'hero') {
      for (const e of enemies) {
        if (e.state === 'dying' || e.state === 'spawning') continue;
        if (p.hitSet && p.hitSet.has(e)) continue;
        const d = Math.hypot(e.pos.x - p.mesh.position.x, e.pos.z - p.mesh.position.z);
        if (d < e.radius + p.r) {
          if (p.kind === 'fire') {
            Audio2.explode();
            shake(0.25);
            Particles.burst(p.mesh.position, 0xff8030, 22, 4.5, 0.8, 0.55, 2);
            Particles.burst(p.mesh.position, 0xffd23d, 10, 3, 0.6, 0.4, 1);
            // pequeña área
            for (const e2 of enemies) {
              if (e2.state === 'dying' || e2.state === 'spawning') continue;
              const d2 = Math.hypot(e2.pos.x - p.mesh.position.x, e2.pos.z - p.mesh.position.z);
              if (d2 < 1.7) damageEnemy(e2, e2 === e ? p.dmg : 12, p.mesh.position, e2 === e);
            }
            dead = true;
          } else if (p.kind === 'ice') {
            Audio2.freezeHit();
            damageEnemy(e, p.dmg, p.mesh.position);
            freezeEnemy(e, 2.4);
            Particles.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.6, e.pos.z), 0xbfeaff, 12, 3, 0.6, 0.5, 2);
            p.hitSet && p.hitSet.add(e);
            if (!p.pierce) dead = true;
          }
          if (dead) break;
        }
      }
    } else if (!dead && p.from === 'enemy') {
      const d = Math.hypot(hero.pos.x - p.mesh.position.x, hero.pos.z - p.mesh.position.z);
      if (d < 0.5 + p.r && p.mesh.position.y < 1.6) {
        damageHero(p.dmg, p.mesh.position);
        Particles.burst(p.mesh.position, 0xff7030, 12, 3, 0.6, 0.4, 2);
        dead = true;
      }
    }
    if (dead) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    s.r += s.speed * dt;
    s.mesh.scale.setScalar(s.r / 0.5);
    s.mesh.material.opacity = clamp(s.life / 0.5, 0, 1) * 0.9;
    if (s.from === 'enemy' && !s.hit) {
      const d = Math.hypot(hero.pos.x - s.mesh.position.x, hero.pos.z - s.mesh.position.z);
      if (Math.abs(d - s.r) < 0.55 && hero.state !== 'dodge') {
        s.hit = true;
        damageHero(s.dmg, s.mesh.position);
      }
    }
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose(); s.mesh.material.dispose();
      shockwaves.splice(i, 1);
    }
  }
}

function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.life -= dt;
    const d = o.mesh.position.distanceTo(hero.pos);
    const magnetR = Game.roundEndTimer >= 0 ? 30 : 3.2;
    if (d < magnetR) o.magnet = true;
    if (o.magnet) {
      const dir = new THREE.Vector3(hero.pos.x, 0.8, hero.pos.z).sub(o.mesh.position).normalize();
      o.vel.lerp(dir.multiplyScalar(11), 8 * dt);
    } else {
      o.vel.y -= 9 * dt;
      if (o.mesh.position.y < 0.15 && o.vel.y < 0) { o.vel.y *= -0.5; o.vel.x *= 0.7; o.vel.z *= 0.7; }
    }
    o.mesh.position.addScaledVector(o.vel, dt);
    o.mesh.rotation.y += 4 * dt; o.mesh.rotation.x += 3 * dt;
    if (d < 0.7) {
      if (o.kind === 'hp') hero.hp = Math.min(hero.hpMax, hero.hp + 5);
      else if (o.kind === 'mp') hero.mp = Math.min(hero.mpMax, hero.mp + 9);
      else Game.score += 10;
      Audio2.orb();
      Particles.burst(o.mesh.position,
        o.kind === 'hp' ? 0x57e86b : o.kind === 'mp' ? 0x5aa7ff : 0xf5c542, 5, 2, 0.4, 0.3, 1);
      o.life = 0;
    }
    if (o.life <= 0) {
      scene.remove(o.mesh);
      o.mesh.geometry.dispose(); o.mesh.material.dispose();
      orbs.splice(i, 1);
    }
  }
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.line.material.opacity = clamp(b.life / b.max, 0, 1);
    if (b.life <= 0) {
      scene.remove(b.line);
      b.line.geometry.dispose(); b.line.material.dispose();
      bolts.splice(i, 1);
    }
  }
}

function updateArena(dt, t) {
  for (const b of arena.userData.banners)
    b.rotation.z = Math.sin(t * 1.6 + b.userData.phase) * 0.06;
  for (const br of arena.userData.braziers) {
    if (Math.random() < 0.5) {
      const p = br.position;
      Particles.spawn(new THREE.Vector3(p.x + rand(-0.2, 0.2), 1.9, p.z + rand(-0.2, 0.2)),
        { x: rand(-0.2, 0.2), y: rand(1, 2.2), z: rand(-0.2, 0.2) },
        new THREE.Color(Math.random() < 0.4 ? 0xffd23d : 0xff7030), rand(0.4, 0.8), rand(0.4, 0.8), -1, 0);
    }
  }
  const crowd = arena.userData.crowd;
  if (crowd) {
    const pos = crowd.geometry.attributes.position;
    const base = crowd.userData.baseY;
    const n = pos.count;
    for (let i = 0; i < n; i++)
      pos.array[i * 3 + 1] = base[i * 3 + 1] + Math.abs(Math.sin(t * 3 + i * 1.7)) * 0.15;
    pos.needsUpdate = true;
  }
  // motas de polvo doradas ambientales
  if (Math.random() < 0.25) {
    Particles.spawn(new THREE.Vector3(rand(-10, 10), rand(0.5, 4), rand(-10, 10)),
      { x: rand(-0.2, 0.2), y: rand(0.05, 0.25), z: rand(-0.2, 0.2) },
      new THREE.Color(0xffe9a8), rand(0.2, 0.4), rand(1.5, 3), 0, 0);
  }
}

/* HUD */
function updateHUD() {
  $('hpFill').style.transform = `scaleX(${clamp(hero.hp / hero.hpMax, 0, 1)})`;
  $('mpFill').style.transform = `scaleX(${clamp(hero.mp / hero.mpMax, 0, 1)})`;
  $('hpBar').classList.toggle('low', hero.hp / hero.hpMax < 0.3);
  $('scoreTxt').textContent = Game.score;
  for (const [kind, btn] of [['fire', 'btnFire'], ['ice', 'btnIce'], ['thunder', 'btnThunder'], ['cure', 'btnCure']]) {
    const el = $(btn), cd = el.querySelector('.cd');
    const rem = hero.cds[kind];
    if (rem > 0) { cd.style.display = 'flex'; cd.textContent = rem.toFixed(1); }
    else cd.style.display = 'none';
    el.classList.toggle('nomp', hero.mp < MAGIC[kind].cost);
  }
  const dcd = $('btnDodge').querySelector('.cd');
  if (hero.dodgeCd > 0.02) { dcd.style.display = 'flex'; dcd.textContent = ''; dcd.style.background = 'rgba(5,8,20,.45)'; }
  else dcd.style.display = 'none';
  const tag = $('comboTag');
  if (hero.chain >= 4 && Game.state === 'playing') {
    tag.textContent = 'Cadena ×' + hero.chain;
    tag.style.opacity = 1;
  } else tag.style.opacity = 0;
}

/* ================================================================ bucle */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3().copy(CAM_OFF).add(hero.pos);

function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (freezeFrames > 0) { freezeFrames -= dt; dt = 0; }

  const running = Game.state === 'playing' || Game.state === 'announce';

  if (running && dt > 0) {
    Game.time += dt;
    updateHero(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateShockwaves(dt);
    updateOrbs(dt);

    // aparición escalonada
    if (Game.spawnQueue.length > 0) {
      Game.spawnTimer -= dt;
      if (Game.spawnTimer <= 0) {
        spawnFromQueue();
        Game.spawnTimer = 0.45;
      }
    } else if (Game.state === 'playing' && enemies.length === 0 && hero.state !== 'dead') {
      // ronda superada
      if (Game.roundEndTimer < 0) {
        Game.roundEndTimer = 1.4;
        if (Game.roundClean) { Game.score += 150; showDmg(hero.pos, '¡Ronda perfecta! +150', '#ffe36b', true); }
        Game.score += 100 * (Game.round + 1);
      } else {
        Game.roundEndTimer -= dt;
        if (Game.roundEndTimer <= 0) {
          Game.roundEndTimer = -1;
          if (Game.round + 1 < CUPS[Game.cup].rounds.length) startRound(Game.round + 1);
          else winCup();
        }
      }
    }
  }

  if (dt > 0) {
    Particles.update(dt);
    updateHearts(dt);
    updateBolts(dt);
    updateArena(dt, t);
  }
  updateDmg(dt);
  if (running) updateHUD();

  // cámara con retardo + temblor
  const targetCam = new THREE.Vector3().copy(hero.pos).add(CAM_OFF);
  camPos.lerp(targetCam, 1 - Math.pow(0.001, dt || 0.016));
  camera.position.copy(camPos);
  if (shakeAmt > 0.001) {
    camera.position.x += rand(-1, 1) * shakeAmt * 0.25;
    camera.position.y += rand(-1, 1) * shakeAmt * 0.25;
    shakeAmt *= Math.pow(0.0001, dt || 0.016);
  }
  camera.lookAt(hero.pos.x, hero.pos.y + 0.9, hero.pos.z - 0.6);

  renderer.render(scene, camera);
}

refreshTitle();
animate();
