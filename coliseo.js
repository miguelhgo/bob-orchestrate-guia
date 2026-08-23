// El Coliseo — mini-juego de acción por rondas en vertical, tributo al estilo
// de los torneos del Coliseo del Olimpo. Todo procedural: sin assets externos.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';

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

  // suelo: losetas radiales de piedra arenisca con emblema de laurel y corona
  const floorTex = canvasTex(1024, 1024, (x, w, h) => {
    const cx = w / 2, cy = h / 2;
    x.fillStyle = '#dcb572'; x.fillRect(0, 0, w, h);
    // moteado de arena
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = `rgba(${120 + Math.random() * 90 | 0},${88 + Math.random() * 62 | 0},40,${Math.random() * 0.13})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2.4, 2.4);
    }
    // juntas de losetas: anillos + radios
    x.strokeStyle = 'rgba(146,102,44,0.55)';
    x.lineWidth = 6;
    for (const r of [180, 300, 420, 500]) {
      x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
    }
    x.lineWidth = 4.5;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180);
      x.lineTo(cx + Math.cos(a) * 512, cy + Math.sin(a) * 512);
      x.stroke();
    }
    // sombreado sutil por loseta (alterna claridad entre sectores)
    for (let ring = 0; ring < 3; ring++) {
      const r0 = [180, 300, 420][ring], r1 = [300, 420, 512][ring];
      for (let i = 0; i < 20; i++) {
        if ((i + ring) % 2) continue;
        const a0 = (i / 20) * TAU, a1 = ((i + 1) / 20) * TAU;
        x.fillStyle = 'rgba(120,86,38,0.07)';
        x.beginPath();
        x.arc(cx, cy, r1, a0, a1);
        x.arc(cx, cy, r0, a1, a0, true);
        x.closePath(); x.fill();
      }
    }
    // emblema central
    x.save(); x.translate(cx, cy);
    // aro exterior dorado
    x.strokeStyle = 'rgba(206,152,44,0.95)'; x.lineWidth = 15;
    x.beginPath(); x.arc(0, 0, 158, 0, TAU); x.stroke();
    x.lineWidth = 5;
    x.beginPath(); x.arc(0, 0, 138, 0, TAU); x.stroke();
    // corona de laurel: hojas a lo largo de dos arcos
    x.fillStyle = 'rgba(206,152,44,0.9)';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const a = Math.PI / 2 + side * (0.45 + i * 0.2);
        x.save();
        x.translate(Math.cos(a) * 118, Math.sin(a) * 118);
        x.rotate(a + side * 0.9);
        x.beginPath(); x.ellipse(0, 0, 22, 8.5, 0, 0, TAU); x.fill();
        x.restore();
      }
    }
    // estrella de ocho puntas
    x.fillStyle = 'rgba(206,152,44,0.85)';
    for (let i = 0; i < 8; i++) {
      x.rotate(TAU / 8);
      x.beginPath(); x.moveTo(0, -42); x.lineTo(13, -92); x.lineTo(-13, -92); x.closePath(); x.fill();
    }
    // medallón azul con corona dorada
    x.fillStyle = '#233163';
    x.beginPath(); x.arc(0, 0, 46, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(206,152,44,0.95)'; x.lineWidth = 4;
    x.beginPath(); x.arc(0, 0, 46, 0, TAU); x.stroke();
    x.fillStyle = '#e8b93a';
    x.beginPath();
    x.moveTo(-26, 14); x.lineTo(-26, -6); x.lineTo(-13, 4); x.lineTo(0, -18);
    x.lineTo(13, 4); x.lineTo(26, -6); x.lineTo(26, 14); x.closePath(); x.fill();
    x.restore();
    // viñeta hacia el borde
    const vg = x.createRadialGradient(cx, cy, 320, cx, cy, 512);
    vg.addColorStop(0, 'rgba(90,60,20,0)');
    vg.addColorStop(1, 'rgba(90,60,20,0.32)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
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

  // banda de tela roja en lo alto del muro, con doble cornisa dorada
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(13.58, 13.58, 0.62, 48, 1, true),
    toon(0x9c2f34, { side: THREE.BackSide })
  );
  band.position.y = 3.05;
  g.add(band);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.22, 8, 48), toon(0xd6a432));
  trim.rotation.x = Math.PI / 2; trim.position.y = 3.4;
  g.add(trim);
  const trim2 = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.12, 8, 48), toon(0xd6a432));
  trim2.rotation.x = Math.PI / 2; trim2.position.y = 2.72;
  g.add(trim2);

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
    const N = 380, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
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

  // columnas acanaladas con anillos dorados
  const colMat = toon(0xdfcc9e), capMat = toon(0xc2ab7c), ringMat = toon(0xc79b3e);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.31;
    const col = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6.4, 14), colMat);
    shaft.position.y = 3.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), capMat);
    base.position.y = 0.25;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), capMat);
    cap.position.y = 6.4;
    const rTop = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.07, 6, 14), ringMat);
    rTop.rotation.x = Math.PI / 2; rTop.position.y = 5.9;
    const rBot = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 6, 14), ringMat);
    rBot.rotation.x = Math.PI / 2; rBot.position.y = 0.62;
    col.add(shaft, base, cap, rTop, rBot);
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

  // estatuas doradas de guerreros que cruzan sus espadas sobre la puerta
  for (const sx of [-1, 1]) {
    const st = new THREE.Group();
    const gold = toon(0xcfa13a), goldDark = toon(0xa87c22);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.9), toon(0xc2ab7c));
    ped.position.y = 0.35;
    const ped2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), toon(0xdfcc9e));
    ped2.position.y = 0.85;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 10), gold);
    body.position.y = 2.2;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), gold);
    chest.scale.set(1, 0.8, 0.8);
    chest.position.y = 3.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), gold);
    head.position.y = 3.85;
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 8), goldDark);
    helm.position.y = 4.3;
    const plume = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0x9c2f34));
    plume.scale.set(0.55, 1.5, 1.1);
    plume.position.set(0, 4.55, -0.05);
    // escudo redondo en el brazo exterior
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), goldDark);
    shield.rotation.z = Math.PI / 2;
    shield.position.set(sx * 0.85, 2.7, 0.15);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), gold);
    boss.position.set(sx * 0.98, 2.7, 0.15);
    // brazo interior alzado con espada gigante inclinada hacia el centro
    const swordG = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.4, 0.09), gold);
    blade.position.y = 2.7;
    const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), gold);
    bladeTip.position.y = 5.55; bladeTip.rotation.y = Math.PI / 4;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.16), goldDark);
    cross.position.y = 0.18;
    swordG.add(blade, bladeTip, cross);
    swordG.position.set(sx * -0.55, 3.3, 0.28);
    swordG.rotation.z = sx * 0.62; // se cruzan sobre el centro de la puerta
    st.add(ped, ped2, body, chest, head, helm, plume, shield, boss, swordG);
    st.position.set(sx * 4.4, 0, -12.3);
    g.add(st);
  }

  // urnas de barro junto a la puerta
  for (const sx of [-1, 1]) {
    const urn = new THREE.Group();
    const clay = toon(0xb0713f), clayDark = toon(0x8a5730);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), clay);
    belly.scale.set(1, 1.25, 1); belly.position.y = 0.55;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 10), clay);
    neck.position.y = 1.12;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 12), clayDark);
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.28;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.16, 10), clayDark);
    foot.position.y = 0.08;
    urn.add(belly, neck, rim, foot);
    urn.position.set(sx * 7.2, 0, -10.6);
    urn.rotation.y = rand(0, TAU);
    g.add(urn);
  }

  // sol y nubes de tarde
  const glowTex = canvasTex(128, 128, (x) => {
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,240,200,0.55)');
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  });
  const sunS = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffe9b0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunS.position.set(-34, 30, -48);
  sunS.scale.setScalar(26);
  g.add(sunS);
  const cloudTex = canvasTex(256, 128, (x) => {
    x.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [cx2, cy2, r] of [[70, 80, 34], [110, 62, 44], [160, 72, 38], [200, 86, 26], [130, 92, 40]]) {
      x.beginPath(); x.arc(cx2, cy2, r, 0, TAU); x.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: rand(0.35, 0.6), depthWrite: false,
      color: 0xfff4dc,
    }));
    const a = rand(0, TAU);
    c.position.set(Math.cos(a) * rand(35, 60), rand(16, 30), Math.sin(a) * rand(35, 60));
    c.scale.set(rand(14, 24), rand(6, 10), 1);
    c.userData.vx = rand(0.15, 0.5) * (Math.random() < 0.5 ? 1 : -1);
    clouds.push(c);
    g.add(c);
  }
  g.userData.clouds = clouds;

  // braseros con fuego
  const braziers = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
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
/* ============ héroe: modelo con esqueleto Mixamo + animaciones ============ */
const BONE = n => 'mixamorig' + n;

// Construye un AnimationClip a partir de poses absolutas (euler XYZ, radianes)
// sobre los huesos del rig Mixamo. [tiempo, x, y, z] por fotograma clave.
function buildClip(name, dur, spec) {
  const tracks = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const bone in spec) {
    const times = [], vals = [];
    for (const k of spec[bone]) {
      times.push(k[0]);
      e.set(k[1], k[2], k[3]);
      q.setFromEuler(e);
      vals.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(BONE(bone) + '.quaternion', times, vals));
  }
  return new THREE.AnimationClip(name, dur, tracks);
}

// Set de animaciones de combate escritas a mano sobre el rig
function combatClips() {
  return [
    // combo 1: tajo descendente de derecha a izquierda
    buildClip('attack1', 0.42, {
      RightArm:     [[0,-2.3,0,-0.5],[0.12,-2.8,0,-1.0],[0.26,0.4,0,-0.15],[0.42,-0.6,0,-0.3]],
      RightForeArm: [[0,0,0,-0.7],[0.12,0,0,-1.5],[0.26,0,0,-0.15],[0.42,0,0,-0.5]],
      Spine:        [[0,0,0.3,0],[0.12,0,0.55,0],[0.26,0,-0.45,0],[0.42,0,-0.1,0]],
      Spine1:       [[0,0,0.15,0],[0.26,0,-0.25,0],[0.42,0,0,0]],
      LeftArm:      [[0,-0.3,0,0.7],[0.26,-0.6,0,1.1],[0.42,-0.2,0,0.5]],
    }),
    // combo 2: revés ascendente de izquierda a derecha
    buildClip('attack2', 0.42, {
      RightArm:     [[0,-0.5,0,-0.2],[0.12,0.6,0,0.5],[0.26,-2.2,0,-0.9],[0.42,-1.2,0,-0.4]],
      RightForeArm: [[0,0,0,-0.4],[0.12,0,0,-0.2],[0.26,0,0,-1.2],[0.42,0,0,-0.6]],
      Spine:        [[0,0,-0.4,0],[0.12,0,-0.6,0],[0.26,0,0.5,0],[0.42,0,0.1,0]],
      Spine1:       [[0,0,-0.2,0],[0.26,0,0.3,0],[0.42,0,0,0]],
      LeftArm:      [[0,-0.2,0,0.5],[0.26,-0.7,0,0.9],[0.42,-0.2,0,0.5]],
    }),
    // combo 3: mandoble giratorio con remate hacia arriba
    buildClip('attack3', 0.62, {
      RightArm:     [[0,-1.0,0,-0.3],[0.15,-2.9,0,-0.6],[0.38,0.9,0,-0.2],[0.62,-0.4,0,-0.3]],
      RightForeArm: [[0,0,0,-0.5],[0.15,0,0,-1.6],[0.38,0,0,-0.1],[0.62,0,0,-0.5]],
      Spine:        [[0,0,0,0],[0.15,-0.25,0.4,0],[0.38,0.15,-0.5,0],[0.62,0,0,0]],
      LeftArm:      [[0,-0.3,0,0.6],[0.38,-1.2,0,1.3],[0.62,-0.2,0,0.5]],
      LeftUpLeg:    [[0,0,0,0],[0.3,-0.5,0,0],[0.62,0,0,0]],
    }),
    // ataque aéreo: tajo en picado con las piernas recogidas
    buildClip('airAttack', 0.5, {
      RightArm:     [[0,-2.6,0,-0.7],[0.16,-3.0,0,-1.1],[0.34,0.7,0,-0.1],[0.5,-0.5,0,-0.3]],
      RightForeArm: [[0,0,0,-0.9],[0.34,0,0,-0.1],[0.5,0,0,-0.5]],
      Spine:        [[0,-0.2,0.25,0],[0.34,0.35,-0.35,0],[0.5,0,0,0]],
      LeftUpLeg:    [[0,-0.9,0,0.2],[0.5,-0.7,0,0.2]],
      RightUpLeg:   [[0,-0.4,0,-0.2],[0.5,-0.3,0,-0.2]],
      LeftLeg:      [[0,1.3,0,0],[0.5,1.1,0,0]],
      RightLeg:     [[0,0.8,0,0],[0.5,0.7,0,0]],
    }),
    // voltereta: cuerpo recogido (el giro lo hace la raíz por código)
    buildClip('roll', 0.45, {
      Spine:        [[0,0.5,0,0],[0.2,0.8,0,0],[0.45,0.15,0,0]],
      Spine1:       [[0,0.35,0,0],[0.2,0.6,0,0],[0.45,0.1,0,0]],
      LeftUpLeg:    [[0,-1.5,0,0.2],[0.2,-2.0,0,0.2],[0.45,-0.4,0,0.1]],
      RightUpLeg:   [[0,-1.5,0,-0.2],[0.2,-2.0,0,-0.2],[0.45,-0.4,0,-0.1]],
      LeftLeg:      [[0,1.8,0,0],[0.2,2.2,0,0],[0.45,0.5,0,0]],
      RightLeg:     [[0,1.8,0,0],[0.2,2.2,0,0],[0.45,0.5,0,0]],
      LeftArm:      [[0,-0.6,0,1.2],[0.45,-0.3,0,0.6]],
      RightArm:     [[0,-0.6,0,-1.2],[0.45,-0.3,0,-0.6]],
    }),
    // lanzamiento de magia: brazo al cielo y torso atrás
    buildClip('cast', 0.5, {
      RightArm:     [[0,-1.0,0,-0.3],[0.16,-3.0,0,-0.35],[0.36,-2.9,0,-0.3],[0.5,-1.2,0,-0.3]],
      RightForeArm: [[0,0,0,-0.5],[0.16,0,0,-0.15],[0.5,0,0,-0.5]],
      Spine:        [[0,0,0,0],[0.2,-0.28,0,0],[0.5,0,0,0]],
      LeftArm:      [[0,-0.3,0,0.5],[0.2,-1.0,0,0.8],[0.5,-0.3,0,0.5]],
    }),
    // impacto recibido
    buildClip('hurt', 0.36, {
      Spine:        [[0,0,0,0],[0.1,-0.5,0.2,0],[0.36,0,0,0]],
      Spine1:       [[0,0,0,0],[0.1,-0.3,0.15,0],[0.36,0,0,0]],
      RightArm:     [[0,-0.8,0,-0.4],[0.1,-1.6,0,-0.8],[0.36,-0.6,0,-0.3]],
      LeftArm:      [[0,-0.3,0,0.5],[0.1,-1.4,0,0.9],[0.36,-0.3,0,0.5]],
    }),
    // caída
    buildClip('die', 0.8, {
      Spine:        [[0,0,0,0],[0.35,-0.6,0.3,0],[0.8,-0.9,0.4,0]],
      RightArm:     [[0,-0.8,0,-0.4],[0.8,-2.2,0,-1.0]],
      LeftArm:      [[0,-0.3,0,0.5],[0.8,-1.8,0,1.2]],
      LeftUpLeg:    [[0,0,0,0.1],[0.8,-0.7,0,0.3]],
      RightUpLeg:   [[0,0,0,-0.1],[0.8,-0.4,0,-0.3]],
    }),
  ];
}

// La espada-llave, ahora pensada para ir sujeta al hueso de la mano
function buildKeyblade() {
  const key = new THREE.Group();
  const silver = toon(0xd4dbe8), silverDark = toon(0x9aa6bd),
    gold = toon(0xd6a432), dark = toon(0x1f1f28);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.82, 10), silver);
  shaft.position.y = 0.42;
  const shaftCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), silverDark);
  shaftCap.position.y = 0.84;
  const toothBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.055), silver);
  toothBar.position.set(0.13, 0.72, 0);
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.055), silver);
  t1.position.set(0.075, 0.85, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.055), silver);
  t2.position.set(0.09, 0.72, 0);
  const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.055), silver);
  t3.position.set(0.1, 0.6, 0);
  const gL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.05), gold);
  gL.position.set(-0.14, 0, 0);
  const gR = gL.clone(); gR.position.x = 0.14;
  const gT = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.045, 0.05), gold);
  gT.position.set(0, 0.17, 0);
  const gB = gT.clone(); gB.position.y = -0.17;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.26, 8), dark);
  const chain = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.009, 5, 8), silverDark);
    link.position.y = -0.22 - i * 0.055;
    link.rotation.y = i * 0.8;
    chain.add(link);
  }
  const charm = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), gold);
  charm.position.y = -0.41;
  chain.add(charm);
  key.add(shaft, shaftCap, toothBar, t1, t2, t3, gL, gR, gT, gB, grip, chain);
  const tip = new THREE.Object3D();
  tip.position.y = 0.9;
  key.add(tip);
  addOutline(key, 0.05);
  return { key, tip };
}

// Contorno negro para mallas con esqueleto: copia con caras traseras
// desplazadas a lo largo de la normal (el escalado no sirve con skinning).
function skinnedOutline(mesh, thickness) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a14, side: THREE.BackSide });
  mat.onBeforeCompile = s => {
    s.uniforms.oThick = { value: thickness };
    s.vertexShader = 'uniform float oThick;\n' + s.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += objectNormal * oThick;');
  };
  const out = new THREE.SkinnedMesh(mesh.geometry, mat);
  out.bind(mesh.skeleton, mesh.bindMatrix);
  out.bindMode = mesh.bindMode;
  out.raycast = () => {};
  out.frustumCulled = false;
  return out;
}

async function loadHeroModel() {
  const loader = new GLTFLoader();
  const gltf = await new Promise((res, rej) => {
    // en la versión de una sola página el modelo viaja embebido en base64
    const b64 = window.__HERO_GLB;
    if (b64) {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      loader.parse(buf.buffer, '', res, rej);
    } else {
      loader.load('assets3d/Soldier.glb', res, undefined, rej);
    }
  });
  const root = new THREE.Group();      // raíz que posicionamos/rotamos en el juego
  const rig = new THREE.Group();       // lo que gira en la voltereta
  const model = gltf.scene;
  rig.add(model);
  root.add(rig);

  // cel-shading sobre los materiales originales, conservando las texturas
  const skinned = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const src = o.material;
    o.material = new THREE.MeshToonMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null, gradientMap: gradTex, skinning: true,
    });
    if (o.isSkinnedMesh) skinned.push(o);
  });
  for (const m of skinned) m.parent.add(skinnedOutline(m, 0.012));

  // escala para que mida ~1.7 unidades de alto en el mundo del juego
  model.updateWorldMatrix(true, true);
  const headBone = model.getObjectByName(BONE('Head'));
  const headY = headBone ? headBone.getWorldPosition(new THREE.Vector3()).y : 1.6;
  const s = 1.7 / Math.max(0.01, headY * 1.14);
  model.scale.setScalar(model.scale.x * s);
  model.position.y = 0;
  model.updateWorldMatrix(true, true);

  // espada-llave sujeta a la mano derecha
  const hand = model.getObjectByName(BONE('RightHand'));
  const { key, tip } = buildKeyblade();
  if (hand) {
    const hs = hand.getWorldScale(new THREE.Vector3()).x;
    key.scale.setScalar(1.15 / Math.max(0.0001, hs));
    key.rotation.set(0.3, Math.PI / 2, -0.3);
    key.position.set(0, 0.02 / Math.max(0.0001, hs), 0);
    hand.add(key);
  } else {
    key.scale.setScalar(1.15); rig.add(key);
  }

  // mezclador y acciones (mocap nativo + combate escrito a mano)
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const addClip = c => {
    // quitamos el desplazamiento de la cadera: el movimiento lo lleva el juego
    const cl = c.clone();
    cl.tracks = cl.tracks.filter(t => !/Hips\.position$/.test(t.name));
    actions[c.name] = mixer.clipAction(cl);
  };
  for (const c of gltf.animations) addClip(c);
  for (const c of combatClips()) addClip(c);
  // nombres del mocap nativo -> los que usa el juego
  if (actions.Idle) actions.idle = actions.Idle;
  if (actions.Run) actions.run = actions.Run;
  if (actions.Walk) actions.walk = actions.Walk;

  root.add(makeBlob(0.5));
  scene.add(root);
  return { root, rig, model, mixer, actions, tip, key };
}

const hero = {
  m: null,                       // se rellena al cargar el modelo
  action: null, actionName: '',  // acción de animación en curso
  y: 0, vy: 0, airborne: false,  // combate aéreo
  airHits: 0,
  pos: new THREE.Vector3(0, 0, 3),
  vel: new THREE.Vector3(),
  facing: 0,
  hp: 100, hpMax: 100, mp: 100, mpMax: 100,
  speed: 5.4,
  state: 'idle', // idle run attack dodge cast hurt dead
  attackStep: 0, attackT: 0, attackQueued: false, attackHitDone: false,
  comboStep: 0, comboTimer: 0,
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
  playAction('cast', 0.08, true, 1);
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
    if (hero.attackT > 0.3) hero.attackQueued = true;
    return;
  }
  if (hero.airborne) { startAttackStep(0); return; }
  // si vuelves a atacar enseguida, sigues el combo en vez de reiniciarlo
  const next = (hero.comboTimer > 0 && hero.comboStep < 2) ? hero.comboStep + 1 : 0;
  startAttackStep(next);
}
function startAttackStep(step) {
  hero.state = 'attack';
  hero.attackStep = step;
  hero.attackT = 0;
  hero.attackQueued = false;
  hero.attackHitDone = false;
  hero.comboStep = step;
  hero.comboTimer = 0.5;
  const t = nearestEnemy(7);
  if (t) hero.facing = Math.atan2(t.pos.x - hero.pos.x, t.pos.z - hero.pos.z);
  if (hero.airborne) {
    // combo aéreo: cada golpe te sostiene y te sube un poco más
    hero.airHits++;
    hero.vy = Math.max(hero.vy, 3.0 - hero.airHits * 0.3);
    playAction('airAttack', 0.08, true, 1 / 0.5 * 1.15);
  } else {
    if (step === 2) {
      // el remate del combo te eleva: sigue golpeando en el aire
      hero.airborne = true;
      hero.vy = 7.4;
      hero.airHits = 0;
      Particles.burst(new THREE.Vector3(hero.pos.x, 0.2, hero.pos.z), 0xffe9a8, 14, 3.5, 0.6, 0.4, 2);
    }
    playAction('attack' + (step + 1), 0.07, true, 1 / [0.34, 0.34, 0.52][step] * 0.42);
  }
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
  playAction('roll', 0.07, true, 1);
  Audio2.roll();
  navigator.vibrate && navigator.vibrate(10);
}

function damageHero(amount, srcPos) {
  if (hero.invuln > 0 || hero.state === 'dodge' || hero.state === 'dead') return;
  if (Game.state !== 'playing') return;
  hero.hp -= amount;
  hero.invuln = 0.9;
  hero.chain = 0;
  if (hero.state !== 'attack' && hero.state !== 'dodge' && hero.state !== 'cast')
    playAction('hurt', 0.06, true, 1);
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
  hero.y = 0; hero.vy = 0; hero.airborne = false; hero.airHits = 0;
  hero.comboStep = 0; hero.comboTimer = 0;
  if (hero.m) { hero.m.rig.rotation.x = 0; hero.m.rig.position.y = 0; }
  hero.action = null; hero.actionName = '';
  if (hero.m) hero.m.mixer.stopAllAction();
  playAction('idle', 0);
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
// Reproduce una acción con fundido; `once` para las que no se repiten.
function playAction(name, fade = 0.14, once = false, speed = 1) {
  const m = hero.m;
  if (!m) return;
  const next = m.actions[name];
  if (!next) return;
  if (hero.actionName === name && !once) return;
  next.enabled = true;
  next.setEffectiveTimeScale(speed);
  next.setEffectiveWeight(1);
  if (once) {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.reset();
  } else {
    next.setLoop(THREE.LoopRepeat, Infinity);
    if (hero.actionName !== name) next.reset();
  }
  if (hero.action && hero.action !== next) next.crossFadeFrom(hero.action, fade, false);
  next.play();
  hero.action = next;
  hero.actionName = name;
}

const GRAVITY = 11.0;

function updateHero(dt) {
  const m = hero.m;
  hero.animT += dt;
  for (const k in hero.cds) hero.cds[k] = Math.max(0, hero.cds[k] - dt);
  hero.dodgeCd = Math.max(0, hero.dodgeCd - dt);
  hero.invuln = Math.max(0, hero.invuln - dt);
  hero.mp = Math.min(hero.mpMax, hero.mp + 4.5 * dt);
  if (hero.chainTimer > 0) { hero.chainTimer -= dt; if (hero.chainTimer <= 0) hero.chain = 0; }
  if (hero.state !== 'attack') hero.comboTimer = Math.max(0, hero.comboTimer - dt);

  if (hero.state === 'dead') {
    playAction('die', 0.2, true);
    m.rig.rotation.x = lerp(m.rig.rotation.x, -Math.PI / 2.6, 3 * dt);
    m.root.position.set(hero.pos.x, hero.y, hero.pos.z);
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
    // avance al golpear (menor en el aire)
    const lunge = hero.airborne ? 1.4 : 3.2;
    hero.pos.x += Math.sin(hero.facing) * dt * (hero.attackT < 0.4 ? lunge : 0.4);
    hero.pos.z += Math.cos(hero.facing) * dt * (hero.attackT < 0.4 ? lunge : 0.4);
    // en el aire, cada golpe frena la caída: te sostienes mientras encadenas
    if (hero.airborne && hero.attackT < 0.62) hero.vy = Math.max(hero.vy, -0.4);
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
      if (hero.attackQueued && (hero.airborne || hero.attackStep < 2)) {
        startAttackStep(hero.airborne ? hero.attackStep : hero.attackStep + 1);
      } else hero.state = hero.airborne ? 'air' : (moving ? 'run' : 'idle');
    }
  } else if (hero.state === 'air') {
    // en el aire se puede dirigir la caída
    if (moving) {
      hero.pos.addScaledVector(mv, hero.speed * 0.55 * dt);
      hero.facing = angleLerp(hero.facing, Math.atan2(mv.x, mv.z), 8 * dt);
    }
    playAction('airAttack', 0.18, false, 0);   // pose de caída
    if (!hero.airborne) hero.state = moving ? 'run' : 'idle';
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
      playAction('run', 0.16);
    } else {
      hero.state = 'idle';
      playAction('idle', 0.22);
    }
  }

  // límites de la arena
  const rr = Math.hypot(hero.pos.x, hero.pos.z);
  if (rr > 12) { hero.pos.x *= 12 / rr; hero.pos.z *= 12 / rr; }

  /* --------- gravedad y colocación --------- */
  if (hero.airborne) {
    hero.vy -= GRAVITY * dt;
    hero.y += hero.vy * dt;
    if (hero.y <= 0) {
      hero.y = 0; hero.vy = 0; hero.airborne = false; hero.airHits = 0;
      Particles.burst(new THREE.Vector3(hero.pos.x, 0.15, hero.pos.z), 0xd7b26c, 8, 2.2, 0.5, 0.3, 3);
      if (hero.state === 'attack') { hero.state = 'idle'; hero.attackHitDone = true; }
    }
  }

  m.root.position.set(hero.pos.x, hero.y, hero.pos.z);
  m.root.rotation.y = hero.facing;

  /* --------- animación: mocap nativo + clips de combate --------- */
  if (hero.state === 'dodge') {
    // el clip encoge el cuerpo; el giro completo lo hace la raíz
    m.rig.rotation.x = (hero.dodgeT / 0.45) * TAU;
    m.rig.position.y = Math.sin((hero.dodgeT / 0.45) * Math.PI) * 0.42;
  } else {
    m.rig.rotation.x = 0;
    m.rig.position.y = 0;
  }

  if (hero.state === 'attack') {
    // partículas en la punta del arma durante el golpe
    if (hero.attackT > 0.2 && hero.attackT < 0.8) {
      const tp = new THREE.Vector3();
      m.tip.getWorldPosition(tp);
      Particles.spawn(tp, { x: 0, y: 0, z: 0 }, new THREE.Color(0xfff2c0), 0.85, 0.18, 0, 0);
    }
  } else if (hero.state === 'cast') {
    const tp = new THREE.Vector3();
    m.tip.getWorldPosition(tp);
    const cc = { fire: 0xff8030, ice: 0x9fdcff, thunder: 0xffe36b, cure: 0x7bf58b }[hero.castKind || 'fire'];
    Particles.spawn(tp, { x: rand(-0.5, 0.5), y: rand(0.5, 1.5), z: rand(-0.5, 0.5) },
      new THREE.Color(cc), 0.7, 0.3, 0, 0);
  }

  // parpadeo de invulnerabilidad
  m.root.visible = hero.invuln <= 0 || Math.floor(hero.invuln * 22) % 3 !== 0;
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
  if (arena.userData.clouds) {
    for (const c of arena.userData.clouds) {
      c.position.x += c.userData.vx * dt;
      if (c.position.x > 65) c.position.x = -65;
      if (c.position.x < -65) c.position.x = 65;
    }
  }
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
    if (rem > 0) {
      cd.style.display = 'flex';
      cd.textContent = rem >= 1 ? Math.ceil(rem) : rem.toFixed(1);
      cd.style.background =
        `conic-gradient(rgba(4,7,18,.82) ${(rem / MAGIC[kind].cd) * 360}deg, rgba(4,7,18,0) 0deg)`;
    } else cd.style.display = 'none';
    el.classList.toggle('nomp', hero.mp < MAGIC[kind].cost);
  }
  const dcd = $('btnDodge').querySelector('.cd');
  if (hero.dodgeCd > 0.02) {
    dcd.style.display = 'flex'; dcd.textContent = '';
    dcd.style.background =
      `conic-gradient(rgba(4,7,18,.7) ${(hero.dodgeCd / 0.85) * 360}deg, rgba(4,7,18,0) 0deg)`;
  } else dcd.style.display = 'none';
  const tag = $('comboTag');
  if (hero.chain >= 4 && Game.state === 'playing') {
    tag.textContent = 'Cadena ×' + hero.chain;
    tag.style.opacity = 1;
  } else tag.style.opacity = 0;
}

/* ================================================================ bucle */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3().copy(CAM_OFF).add(hero.pos);
let camFollowY = 0;

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

  if (hero.m && dt > 0) hero.m.mixer.update(dt);

  if (dt > 0) {
    Particles.update(dt);
    updateHearts(dt);
    updateBolts(dt);
    updateArena(dt, t);
  }
  updateDmg(dt);
  if (running) updateHUD();

  // cámara con retardo + temblor (sigue parcialmente la altura en los saltos)
  camFollowY = lerp(camFollowY, hero.y * 0.55, 1 - Math.pow(0.02, dt || 0.016));
  const targetCam = new THREE.Vector3().copy(hero.pos).add(CAM_OFF);
  targetCam.y += camFollowY;
  camPos.lerp(targetCam, 1 - Math.pow(0.001, dt || 0.016));
  camera.position.copy(camPos);
  if (shakeAmt > 0.001) {
    camera.position.x += rand(-1, 1) * shakeAmt * 0.25;
    camera.position.y += rand(-1, 1) * shakeAmt * 0.25;
    shakeAmt *= Math.pow(0.0001, dt || 0.016);
  }
  camera.lookAt(hero.pos.x, hero.pos.y + 0.9 + camFollowY, hero.pos.z - 0.6);

  renderer.render(scene, camera);
}

/* ================================================================ arranque */
window.__dbg = () => ({ state: hero.state, anim: hero.actionName, y: +hero.y.toFixed(2),
  vy: +hero.vy.toFixed(2), air: hero.airborne, hp: Math.round(hero.hp) });

refreshTitle();
animate();

(async () => {
  const cups = document.querySelectorAll('.cup');
  const hint = document.querySelector('#ovTitle .hint');
  const prevHint = hint ? hint.innerHTML : '';
  cups.forEach(c => { c.style.pointerEvents = 'none'; c.style.opacity = '.45'; });
  if (hint) hint.innerHTML = 'Cargando al héroe…';
  try {
    hero.m = await loadHeroModel();
    hero.m.root.position.set(hero.pos.x, 0, hero.pos.z);
    hero.m.root.rotation.y = Math.PI;
    playAction('idle', 0);
  } catch (err) {
    if (hint) hint.innerHTML = 'No se pudo cargar el modelo del héroe.<br/>' + err.message;
    return;
  }
  cups.forEach(c => { c.style.pointerEvents = ''; c.style.opacity = ''; });
  if (hint) hint.innerHTML = prevHint;
  window.HERO_READY = true;
})();
