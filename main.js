/**
 * Thor Cinematic - Marvel Storm Experience
 * Three.js storm sky + GSAP ScrollTrigger + custom cursor
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  lightning: {
    boltCount   : 8,
    boltSegments: 18,
    branchDepth : 5,
    // per-scene intensity 0=calm → 1=max  (8 scenes: 0-7)
    sceneIntensity: [0.04, 0.18, 0.44, 0.85, 0.60, 0.95, 1.0, 0.65],
  },
  // Warm color-grade scenes (indices)
  warmScenes: new Set([0, 1, 2, 7]),
  bloom: {
    baseStrength : 0.05,
    flashStrength: 0.5,
    radius       : 0.05,
    threshold    : 0.02,
  },
  storm : { cloudLayers: 12, fogDensity: 0.018 },
  camera: { baseZ: 18, driftX: 1.6, driftY: 0.8, driftZ: 3.5, speed: 0.1 },
  cursor: { trailCount: 14, trailDecay: 0.88 },
};

// ─── DOM ───────────────────────────────────────────────────────────────────
const canvasContainer  = document.getElementById('canvas-container');
const cursorDot        = document.getElementById('cursor-dot');
const cursorParticles  = document.getElementById('cursor-particles');
const scrollProgressEl = document.getElementById('scroll-progress');

// ─── STATE ─────────────────────────────────────────────────────────────────
let threeScene, camera, renderer, composer, bloomPass, afterimagePass;
let stormClouds    = [];
let lightningBolts = [];
let flashLight, warmLight;
let clock;
let cursorTrail    = [];
let isFlashActive  = false;
let activeSceneIndex    = -1;
let lightningTimer      = 0;
let nextLightningIn     = 2.5;
let scrollProgressValue = 0;
let parallaxStrength    = 1;
let _warmTarget  = 0;
let _warmCurrent = 0;
const warmOverlays = new Map();

// ─── THREE.JS ──────────────────────────────────────────────────────────────
function initThree() {
  clock = new THREE.Clock();

  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x030308);
  threeScene.fog = new THREE.FogExp2(0x050a12, CONFIG.storm.fogDensity);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, CONFIG.camera.baseZ);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasContainer.appendChild(renderer.domElement);

  threeScene.add(new THREE.AmbientLight(0x060c18, 0.35));
  const key = new THREE.DirectionalLight(0x2a4a6a, 0.25);
  key.position.set(5, 5, 10);
  threeScene.add(key);
  const fill = new THREE.PointLight(0x1a3a5a, 0.2, 80);
  fill.position.set(-5, -2, 8);
  threeScene.add(fill);
  flashLight = new THREE.AmbientLight(0xffffff, 0);
  threeScene.add(flashLight);
  warmLight = new THREE.AmbientLight(0xff9944, 0);
  threeScene.add(warmLight);

  createStormClouds();
  createLightningBolts();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(threeScene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.baseStrength, CONFIG.bloom.radius, CONFIG.bloom.threshold
  );
  composer.addPass(bloomPass);
  afterimagePass = new AfterimagePass(0.91);
  composer.addPass(afterimagePass);
}

// ─── CLOUDS ────────────────────────────────────────────────────────────────
function createStormClouds() {
  for (let i = 0; i < CONFIG.storm.cloudLayers; i++) {
    const depth = i / CONFIG.storm.cloudLayers;
    const z     = -20 - depth * 55 - Math.random() * 15;
    const geo   = new THREE.PlaneGeometry(100 + Math.random() * 80, 50 + Math.random() * 50, 12, 6);
    const mat   = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.62, 0.35, 0.03 + depth * 0.03),
      transparent: true,
      opacity: 0.10 + depth * 0.16 + Math.random() * 0.08,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh  = new THREE.Mesh(geo, mat);
    const baseX = (Math.random() - 0.5) * 80;
    const baseY = (Math.random() - 0.5) * 50;
    mesh.position.set(baseX, baseY, z);
    mesh.rotation.x = Math.PI * (0.05 + Math.random() * 0.1);
    mesh.rotation.z = (Math.random() - 0.5) * 0.2;
    mesh.scale.setScalar(0.7 + Math.random() * 0.6);
    threeScene.add(mesh);
    stormClouds.push({ mesh, baseX, baseY, baseZ: z,
      speed: 0.004 + depth * 0.01 + Math.random() * 0.006,
      parallaxFactor: 0.3 + depth * 0.9,
      mat, baseLightness: 0.03 + depth * 0.03,
    });
  }
  for (let i = 0; i < 3; i++) {
    const mat  = new THREE.MeshBasicMaterial({ color: 0x03060c, transparent: true, opacity: 0.08 + i * 0.05, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(180, 100, 1, 1), mat);
    mesh.position.z = -35 - i * 25;
    threeScene.add(mesh);
    stormClouds.push({ mesh, baseX: 0, baseY: 0, baseZ: mesh.position.z, speed: 0.005, parallaxFactor: 0.2, mat, baseLightness: 0 });
  }
}

function updateStormClouds(t) {
  const scrollOffsetX = (scrollProgressValue - 0.5) * 25;
  stormClouds.forEach(({ mesh, baseX, baseY, baseZ, speed, parallaxFactor, mat, baseLightness }) => {
    const p = parallaxStrength * parallaxFactor;
    mesh.position.x = baseX + Math.sin(t * speed * p + parallaxFactor) * 5 + scrollOffsetX * parallaxFactor * 0.5;
    mesh.position.y = baseY + Math.sin(t * speed * 0.6 * p + parallaxFactor * 0.4) * 3 + Math.cos(t * speed * 0.3 * p) * 1.1;
    mesh.position.z = baseZ + Math.cos(t * speed * 0.5 * p) * 2;
  });
}

// ─── LIGHTNING ─────────────────────────────────────────────────────────────
function boltSegment(segs, sx = 2.5, sy = 3) {
  const pts = [new THREE.Vector3(0, 0, 0)];
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    x += (Math.random() - 0.5) * sx;
    y += (Math.random() - 0.4) * sy - 0.5;
    pts.push(new THREE.Vector3(x, y, 0));
  }
  return pts;
}

function buildBolt(mainSegs, branches, scale = 1) {
  const main = boltSegment(mainSegs, 3, 4);
  const parts = [main];
  for (let b = 0; b < branches; b++) {
    const from = main[Math.floor(main.length * (0.3 + Math.random() * 0.5))];
    if (!from) continue;
    const branch = boltSegment(4 + Math.floor(Math.random() * 4), 2, 2);
    branch.forEach((p, i) => {
      if (i === 0) return;
      p.x = from.x + p.x * scale; p.y = from.y + p.y * scale;
    });
    parts.push(branch);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(parts.flat());
  const mat = new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 1, linewidth: 2 });
  return { geo, mat };
}

function createLightningBolts() {
  const positions = [[-18,10,-18],[18,6,-22],[-10,-6,-20],[14,-8,-24],[0,12,-16],[-14,0,-19],[8,10,-21],[-6,-10,-23]];
  for (let i = 0; i < CONFIG.lightning.boltCount; i++) {
    const pos = positions[i] || [(Math.random()-0.5)*30,(Math.random()-0.5)*25,-20-Math.random()*10];
    const { geo, mat } = buildBolt(CONFIG.lightning.boltSegments, CONFIG.lightning.branchDepth, 1.2 + Math.random() * 0.8);
    const bolt = new THREE.Line(geo, mat);
    bolt.position.set(...pos); bolt.scale.setScalar(1.2 + Math.random() * 0.8);
    bolt.visible = false; bolt.userData.basePos = [...pos];
    threeScene.add(bolt); lightningBolts.push(bolt);
  }
}

function flashBolt(count = 1) {
  for (let c = 0; c < count; c++) {
    setTimeout(() => {
      const bolt = lightningBolts[Math.floor(Math.random() * lightningBolts.length)];
      if (!bolt) return;
      bolt.visible = true; bolt.material.opacity = 1;
      gsap.to(bolt.material, { opacity: 0, duration: 0.05 + Math.random() * 0.07, onComplete: () => { bolt.visible = false; } });
    }, c * (55 + Math.random() * 75));
  }
}

function triggerFlash(intensity = 0.5) {
  if (isFlashActive) return;
  isFlashActive = true;
  const strength  = CONFIG.bloom.baseStrength + intensity * (CONFIG.bloom.flashStrength - CONFIG.bloom.baseStrength);
  const flashAmt  = intensity * 0.55;
  const exposure  = 0.5 + intensity * 0.55;
  if (flashLight) flashLight.intensity = flashAmt;
  renderer.toneMappingExposure = exposure;
  bloomPass.strength = strength;
  flashSceneImage(intensity);
  setTimeout(() => {
    gsap.to({ v: flashAmt  }, { v: 0,   duration: 0.3,  onUpdate: function() { if(flashLight) flashLight.intensity = this.targets()[0].v; } });
    gsap.to({ v: exposure  }, { v: 0.5, duration: 0.4,  onUpdate: function() { renderer.toneMappingExposure = this.targets()[0].v; } });
    gsap.to({ v: strength  }, { v: CONFIG.bloom.baseStrength, duration: 0.45, onUpdate: function() { bloomPass.strength = this.targets()[0].v; } });
    isFlashActive = false;
  }, 70 + intensity * 130);
}

function flashSceneImage(intensity) {
  const active = document.querySelector('.scene.active .scene-img');
  if (!active) return;
  active.style.transition = 'filter 0.04s ease';
  active.style.filter = `brightness(${1 + intensity * 1.1}) contrast(${1 + intensity * 0.35})`;
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:absolute;inset:0;z-index:10;pointer-events:none;background:rgba(255,255,255,${intensity * 0.15});mix-blend-mode:screen;`;
  active.closest('.scene')?.appendChild(overlay);
  setTimeout(() => {
    active.style.filter = ''; active.style.transition = 'filter 0.3s ease';
    overlay.style.transition = 'opacity 0.18s ease'; overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 220);
  }, 70 + intensity * 70);
}

function updateAutoLightning(delta) {
  const intensity = CONFIG.lightning.sceneIntensity[activeSceneIndex] ?? 0;
  if (intensity < 0.04) return;
  lightningTimer += delta;
  if (lightningTimer < nextLightningIn) return;
  lightningTimer = 0;
  nextLightningIn = Math.max(0.25, (1.2 - intensity * 1.1)) + Math.random() * Math.max(0.4, 4.5 - intensity * 3.8);
  flashBolt(Math.ceil(intensity * 2.5));
  if (intensity > 0.45) triggerFlash(intensity * 0.55);
}

// ─── WARM BLEND — REMOVED (images stay natural) ────────────────────────────
function updateWarmBlend(_delta) {
  // intentionally empty — no warm tinting
}

// ─── CAMERA ────────────────────────────────────────────────────────────────
function updateCamera(t) {
  const { driftX, driftY, driftZ, baseZ, speed } = CONFIG.camera;
  const intensity = CONFIG.lightning.sceneIntensity[activeSceneIndex] ?? 0;
  const sm = 0.45 + intensity * 0.75;
  const tx = Math.sin(t * speed * 0.7) * driftX * sm + Math.sin(t * speed * 0.28 + 1.2) * driftX * 0.35 * sm;
  const ty = Math.cos(t * speed * 0.5 + 0.5) * driftY * sm + Math.sin(t * speed * 0.19) * driftY * 0.28 * sm;
  const tz = baseZ - scrollProgressValue * driftZ + Math.sin(t * speed * 0.38) * 0.55 * sm;
  camera.position.x += (tx - camera.position.x) * 0.022;
  camera.position.y += (ty - camera.position.y) * 0.018;
  camera.position.z += (tz - camera.position.z) * 0.028;
  camera.lookAt(0, 0, 0);
}

// ─── CURSOR ────────────────────────────────────────────────────────────────
function initCursor() {
  document.addEventListener('mousemove', (e) => {
    cursorTrail.push({ x: e.clientX, y: e.clientY, life: 1 });
    if (cursorTrail.length > CONFIG.cursor.trailCount) cursorTrail.shift();
  });
  document.addEventListener('click', (e) => spawnClickBolt(e.clientX, e.clientY));
  setInterval(() => {
    cursorTrail = cursorTrail.map(p => ({ ...p, life: p.life * CONFIG.cursor.trailDecay })).filter(p => p.life > 0.05);
    if (!cursorParticles) return;
    cursorTrail.forEach((p, i) => {
      let el = cursorParticles.querySelector(`[data-id="${i}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'cursor-spark';
        el.setAttribute('data-id', i);
        el.style.cssText = `position:fixed;width:5px;height:5px;border-radius:50%;background:rgba(0,212,255,.9);box-shadow:0 0 8px #00d4ff;pointer-events:none;z-index:9996;`;
        cursorParticles.appendChild(el);
      }
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.style.opacity = p.life;
      el.style.transform = `translate(-50%,-50%) scale(${p.life})`;
    });
  }, 50);
}

function spawnClickBolt(x, y) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;overflow:visible;`;
  const arms = 4 + Math.floor(Math.random() * 3);
  for (let a = 0; a < arms; a++) {
    const angle = (a / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const length = 45 + Math.random() * 55;
    let px = x, py = y, d = `M${px},${py}`;
    for (let s = 0; s < 6 + Math.floor(Math.random() * 4); s++) {
      const prog = (s + 1) / 7;
      px = x + Math.cos(angle) * length * prog + (Math.random() - 0.5) * (1 - prog) * 16;
      py = y + Math.sin(angle) * length * prog + (Math.random() - 0.5) * (1 - prog) * 16;
      d += ` L${px},${py}`;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d); path.setAttribute('stroke','rgba(100,200,255,.92)');
    path.setAttribute('stroke-width','1.5'); path.setAttribute('fill','none');
    path.setAttribute('filter','drop-shadow(0 0 4px #00d4ff)');
    svg.appendChild(path);
  }
  document.body.appendChild(svg);
  gsap.to(svg, { opacity: 0, duration: 0.32, ease: 'power2.out', onComplete: () => svg.remove() });
}

// ─── TEXT ANIMATIONS ───────────────────────────────────────────────────────
function reanimateTitle(titleEl, direction) {
  if (!titleEl) return;
  if (!titleEl.dataset.split) {
    splitTitle(titleEl, direction);
    return;
  }
  const spans = titleEl.querySelectorAll('span');
  gsap.killTweensOf(spans);
  gsap.set(spans, { y: direction * 26, opacity: 0 });
  gsap.to(spans, {
    y: 0, opacity: 1, duration: 0.62, ease: 'power3.out',
    stagger: { each: 0.038, from: direction > 0 ? 'start' : 'end' },
  });
}

function splitTitle(el, direction = 1) {
  if (!el || el.dataset.split) return;
  el.dataset.split = '1';
  const parts = el.innerHTML.split(/(<br\s*\/?>)/gi);
  el.innerHTML = '';
  parts.forEach(part => {
    if (/^<br/i.test(part)) { el.appendChild(document.createElement('br')); return; }
    [...part].forEach(char => {
      const span = document.createElement('span');
      span.style.cssText = 'display:inline-block;opacity:0;transform:translateY(26px);will-change:transform,opacity;';
      span.textContent = char === ' ' ? '\u00A0' : char;
      el.appendChild(span);
    });
  });
  gsap.to(el.querySelectorAll('span'), {
    y: 0, opacity: 1, duration: 0.62, ease: 'power3.out',
    stagger: { each: 0.038, from: direction > 0 ? 'start' : 'end' },
  });
}

// warm overlays removed — images stay natural
function ensureWarmOverlay(_sceneEl, _index) {}
function updateWarmOverlays() {}

// ─── SCROLL SYSTEM ─────────────────────────────────────────────────────────
function initScrollTrigger() {
  const scenes = gsap.utils.toArray('.story-scene');
  if (!scenes.length) return;

  const N       = scenes.length;
  const segment = 1 / N;          // each scene owns 1/N of the timeline
  const XFADE   = segment * 0.3;  // crossfade window = 30% of a segment

  // Scene 0 visible immediately; all others hidden
  gsap.set(scenes, { opacity: 0, pointerEvents: 'none' });
  gsap.set(scenes[0], { opacity: 1 });

  // ── Build a pure-opacity crossfade timeline ─────────────────────────────
  // Each scene:
  //   • stays at opacity 1 from its own start until 70% through its segment
  //   • crossfades OUT over the final 30% of its segment
  //   • the NEXT scene crossfades IN over that same 30% window
  // This means two scenes are always partially visible during a transition —
  // opacity never hits 0 for both at the same time → no black gap ever.
  const tl = gsap.timeline({ paused: true });

  // Anchor: scene 0 is ALWAYS opacity 1 at timeline position 0.
  // This means tl.progress(0) never blacks it out regardless of refresh.
  tl.set(scenes[0], { opacity: 1 }, 0);

  scenes.forEach((sceneEl, i) => {
    const segStart  = i * segment;
    const xfadeAt   = segStart + segment * 0.70;  // when fade-out begins
    const segEnd    = (i + 1) * segment;

    // Scene 0 is already opacity:1. For scenes 1+ we fade them in.
    if (i > 0) {
      // Fade in aligned with PREVIOUS scene's fade-out start
      const prevXfadeAt = (i - 1) * segment + segment * 0.70;
      tl.fromTo(sceneEl,
        { opacity: 0 },
        { opacity: 1, duration: XFADE, ease: 'power1.inOut' },
        prevXfadeAt
      );
    }

    // Fade out (not the last scene)
    if (i < N - 1) {
      tl.to(sceneEl,
        { opacity: 0, duration: XFADE, ease: 'power1.inOut' },
        xfadeAt
      );
    }

    // Parallax tweens (run over the full segment)
    const bgEl  = sceneEl.querySelector('.scene-bg');
    const txtEl = sceneEl.querySelector('.story-text, .hero-text, .ero-text');
    if (bgEl)  tl.fromTo(bgEl,  { y: 0 }, { y: -30, ease: 'none', duration: segment }, segStart);
    if (txtEl) tl.fromTo(txtEl, { y: 0 }, { y: -12, ease: 'none', duration: segment }, segStart);

    // Final scene slow zoom
    if (i === N - 1) {
      const img = sceneEl.querySelector('.scene-img');
      if (img) tl.fromTo(img, { scale: 1 }, { scale: 1.07, ease: 'power2.out', duration: segment * 0.8 }, segStart);
    }
  });

  // ── ScrollTrigger scrubs the timeline ──────────────────────────────────
  ScrollTrigger.create({
    trigger : '#story',
    start   : 'top top',
    end     : `+=${N * 600}`,
    scrub   : 0.8,
    pin     : true,
    onUpdate(self) {
      const p = self.progress;
      scrollProgressValue = p;
      parallaxStrength    = 0.5 + p * 0.8;
      if (scrollProgressEl) scrollProgressEl.style.width = p * 100 + '%';

      tl.progress(p);  // manually drive timeline — works in both directions

      // Active scene = whichever segment p falls in
      const raw = Math.min(N - 1, Math.floor(p * N));
      if (raw !== activeSceneIndex) activateScene(scenes, raw, activeSceneIndex);
    },
  });

  // Activate scene 0 immediately
  activateScene(scenes, 0, -1);
}

function activateScene(scenes, newIndex, prevIndex) {
  const direction = newIndex > prevIndex ? 1 : -1;

  scenes.forEach(s => s.classList.remove('active'));
  const sceneEl = scenes[newIndex];
  if (!sceneEl) return;
  sceneEl.classList.add('active');
  gsap.set(scenes, { pointerEvents: 'none' });
  gsap.set(sceneEl, { pointerEvents: 'auto' });

  activeSceneIndex = newIndex;

  // Lightning strike on scene entry (forward only to avoid flicker on scroll-back)
  if (direction > 0 && prevIndex >= 0) {
    const intensity = CONFIG.lightning.sceneIntensity[newIndex] ?? 0.3;
    flashBolt(newIndex === scenes.length - 1 ? 4 : Math.ceil(intensity * 2) + 1);
    if (intensity > 0.15) triggerFlash(intensity * 0.65);
  }

  // Title letter reveal — direction-aware stagger
  const title = sceneEl.querySelector('.story-title, .hero-title, .ero-title');
  reanimateTitle(title, direction);

  // Body text
  const body = sceneEl.querySelector('.story-body, .hero-subtitle, .ero-kicker');
  if (body) {
    gsap.killTweensOf(body);
    gsap.fromTo(body,
      { opacity: 0, y: direction * 20, filter: 'blur(4px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.72, delay: 0.16, ease: 'power3.out', clearProps: 'filter' }
    );
  }
}

// ─── RENDER LOOP ───────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const t     = clock.getElapsedTime();

  updateCamera(t);
  updateStormClouds(t);
  updateAutoLightning(delta);
  updateWarmBlend(delta);
  updateWarmOverlays();

  lightningBolts.forEach(bolt => {
    if (!bolt.visible || !bolt.userData.basePos) return;
    bolt.position.x = bolt.userData.basePos[0] + (scrollProgressValue - 0.5) * 3;
  });

  if (!isFlashActive) {
    const intensity = CONFIG.lightning.sceneIntensity[activeSceneIndex] ?? 0;
    bloomPass.strength = CONFIG.bloom.baseStrength + Math.sin(t * 0.38) * 0.22 + intensity * 0.38 - _warmCurrent * 0.22;
  }

  composer.render();
}

// ─── RESIZE ────────────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  if (afterimagePass) afterimagePass.setSize(w, h);
  ScrollTrigger.refresh();
}


// ─── CINEMATIC INTRO ───────────────────────────────────────────────────────
function initIntro() {
  const intro      = document.getElementById('intro');
  const canvas     = document.getElementById('intro-canvas');
  const flash      = document.getElementById('intro-flash');
  const logo       = document.getElementById('intro-logo');
  const word       = logo?.querySelector('.intro-word');
  const sub        = logo?.querySelector('.intro-sub');
  const kicker     = logo?.querySelector('.intro-kicker');
  const heroImg    = document.getElementById('intro-hero-img');
  const rainCanvas = document.getElementById('intro-rain');
  if (!intro || !canvas) return;

  const ctx = canvas.getContext('2d');
  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  // ── Rain streaks canvas ─────────────────────────────────────────────────
  let rainRAF;
  if (rainCanvas) {
    rainCanvas.width  = W;
    rainCanvas.height = H;
    const rCtx = rainCanvas.getContext('2d');
    const drops = [];
    for (let i = 0; i < 200; i++) {
      drops.push({
        x    : Math.random() * W,
        y    : Math.random() * H,
        len  : 12 + Math.random() * 30,
        speed: 9 + Math.random() * 16,
        alpha: 0.10 + Math.random() * 0.30,
        width: 0.4 + Math.random() * 0.7,
      });
    }
    const drawRain = () => {
      rCtx.clearRect(0, 0, W, H);
      rCtx.strokeStyle = '#b8dcff';
      rCtx.lineCap = 'round';
      drops.forEach(d => {
        rCtx.globalAlpha = d.alpha;
        rCtx.lineWidth   = d.width;
        rCtx.beginPath();
        rCtx.moveTo(d.x, d.y);
        rCtx.lineTo(d.x - d.len * 0.07, d.y + d.len);
        rCtx.stroke();
        d.y += d.speed;
        if (d.y > H + d.len) { d.y = -d.len; d.x = Math.random() * W; }
      });
      rCtx.globalAlpha = 1;
      rainRAF = requestAnimationFrame(drawRain);
    };
    drawRain();
  }

  // ── Hero image lightning reactions ──────────────────────────────────────
  // Flashes the background image brighter in sync with lightning, then fades back
  let imgFlashTimer = null;
  function flashHeroImage(intensity) {
    if (!heroImg) return;
    if (imgFlashTimer) clearTimeout(imgFlashTimer);
    const bright = (0.38 + intensity * 1.05).toFixed(2);
    const sat    = (0.65 + intensity * 0.55).toFixed(2);
    const contr  = (1.10 + intensity * 0.25).toFixed(2);
    heroImg.style.transition = 'filter 0.03s linear';
    heroImg.style.filter = `brightness(${bright}) saturate(${sat}) contrast(${contr})`;
    imgFlashTimer = setTimeout(() => {
      heroImg.style.transition = 'filter 0.60s ease-out';
      heroImg.style.filter     = 'brightness(0.38) saturate(0.65) contrast(1.1)';
    }, 50 + intensity * 100);
  }

  // Subtle ambient flickers while border travels around the frame
  let flickerActive = true;
  const scheduleFlicker = () => {
    if (!flickerActive) return;
    setTimeout(() => {
      if (!flickerActive) return;
      flashHeroImage(0.06 + Math.random() * 0.22);
      scheduleFlicker();
    }, 90 + Math.random() * 300);
  };
  scheduleFlicker();

  // ── Border lightning state ──────────────────────────────────────────────
  // We draw a "travelling arc" along each edge using a progress 0→1 value.
  // Each arc is a jagged polyline that advances each frame.
  const EDGE_DUR = 0.42;   // seconds per edge
  const edges = [
    { axis: 'x', from: [0, 0], to: [1, 0], fixed: 'y', fixedVal: 0 },  // top
    { axis: 'y', from: [1, 0], to: [1, 1], fixed: 'x', fixedVal: 1 },  // right
    { axis: 'x', from: [1, 1], to: [0, 1], fixed: 'y', fixedVal: 1 },  // bottom
    { axis: 'y', from: [0, 1], to: [0, 0], fixed: 'x', fixedVal: 0 },  // left
  ];

  function generateEdgePath(edge, segments = 56) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Low-frequency wander
      const lf = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * 0.022 * Math.sin(t * Math.PI);
      // High-frequency micro-jitter
      const hf = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * 0.006;
      let x, y;
      if (edge.fixed === 'y') {
        x = edge.from[0] + (edge.to[0] - edge.from[0]) * t;
        y = edge.fixedVal + lf + hf;
      } else {
        x = edge.fixedVal + lf + hf;
        y = edge.from[1] + (edge.to[1] - edge.from[1]) * t;
      }
      pts.push([x * W, y * H]);
    }
    return pts;
  }

  let edgePaths = edges.map(e => generateEdgePath(e));

  // Spark particles for convergence
  const sparks = [];
  function spawnConvergeSparks() {
    for (let i = 0; i < 60; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 0.35 + Math.random() * 0.45;
      sparks.push({
        x    : W * 0.5 + Math.cos(angle) * W * radius,
        y    : H * 0.5 + Math.sin(angle) * H * radius,
        tx   : W * 0.5 + (Math.random() - 0.5) * 60,
        ty   : H * 0.5 + (Math.random() - 0.5) * 60,
        life : 1,
        speed: 0.04 + Math.random() * 0.06,
        size : 1 + Math.random() * 2.5,
      });
    }
  }

  // ── GSAP timeline ──────────────────────────────────────────────────────
  const tl = gsap.timeline({ onComplete: finishIntro });

  // Phase 1: border lightning travels (0 → ~1.7s)
  const borderState = { progress: 0 };
  let lastCompletedEdge = -1;

  tl.to(borderState, {
    progress: 4,
    duration: EDGE_DUR * 4,
    ease    : 'none',
    onUpdate() {
      drawBorderLightning(borderState.progress);
      // Fire stronger image flash at each completed corner
      const completedEdge = Math.floor(borderState.progress);
      if (completedEdge > lastCompletedEdge && completedEdge <= 4) {
        lastCompletedEdge = completedEdge;
        flashHeroImage(0.34 + completedEdge * 0.09);
      }
    },
  }, 0);

  // Phase 2: convergence (starts when border finishes, ~1.7s)
  const convergeState = { t: 0 };
  tl.call(spawnConvergeSparks, [], EDGE_DUR * 4);
  tl.to(convergeState, {
    t       : 1,
    duration: 0.55,
    ease    : 'power2.in',
    onUpdate() {
      drawConverge(convergeState.t);
    },
  }, EDGE_DUR * 4);

  // Phase 3: peak image flash just before the white flash overlay
  tl.call(() => {
    flickerActive = false;
    flashHeroImage(1.0);   // full brightness burst on the hero photo
  }, [], EDGE_DUR * 4 + 0.46);

  // White flash overlay at peak convergence
  tl.to(flash, {
    opacity : 1,
    duration: 0.08,
    ease    : 'none',
  }, EDGE_DUR * 4 + 0.5);

  // Logo bursts in during flash
  tl.call(() => {
    if (kicker) gsap.set(kicker, { opacity: 1 });
    if (word) gsap.to(word, { y: '0%', duration: 0.55, ease: 'power4.out' });
    if (sub)  gsap.to(sub,  { opacity: 1, duration: 0.5, delay: 0.2, ease: 'power2.out' });
    gsap.to(logo, { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' });
  }, [], EDGE_DUR * 4 + 0.52);

  // Flash fades out
  tl.to(flash, {
    opacity : 0,
    duration: 0.45,
    ease    : 'power2.out',
  }, EDGE_DUR * 4 + 0.56);

  // Hold logo for a beat
  tl.to({}, { duration: 0.7 }, EDGE_DUR * 4 + 0.7);

  // Phase 4: fade out entire intro
  tl.to(intro, {
    opacity : 0,
    duration: 0.65,
    ease    : 'power2.inOut',
  }, EDGE_DUR * 4 + 1.4);

  // ── Canvas render helpers ───────────────────────────────────────────────
  function drawBorderLightning(progress) {
    ctx.clearRect(0, 0, W, H);

    for (let e = 0; e < 4; e++) {
      const edgeProg = Math.min(1, Math.max(0, progress - e));
      if (edgeProg <= 0) continue;

      const path         = edgePaths[e];
      const visibleCount = Math.ceil(edgeProg * (path.length - 1));

      // ── Layer 1: wide outer bloom ──────────────────────────────────────
      ctx.save();
      ctx.shadowColor = 'rgba(0, 100, 220, 0.8)';
      ctx.shadowBlur  = 45;
      ctx.strokeStyle = 'rgba(0, 130, 255, 0.18)';
      ctx.lineWidth   = 18;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i <= visibleCount && i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();

      // ── Layer 2: mid glow ──────────────────────────────────────────────
      ctx.shadowColor = '#0099ff';
      ctx.shadowBlur  = 22;
      ctx.strokeStyle = 'rgba(0, 180, 255, 0.38)';
      ctx.lineWidth   = 7;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i <= visibleCount && i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();

      // ── Layer 3: bright core channel ──────────────────────────────────
      ctx.shadowColor = '#c8ecff';
      ctx.shadowBlur  = 10;
      ctx.strokeStyle = 'rgba(210, 245, 255, 0.97)';
      ctx.lineWidth   = 1.8;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i <= visibleCount && i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
      ctx.restore();

      // ── Branching sub-bolts off completed sections ─────────────────────
      if (visibleCount > 4) {
        const branchCount = Math.floor(visibleCount / 5);
        for (let b = 0; b < branchCount; b++) {
          const srcIdx = Math.floor(3 + (b / branchCount) * (visibleCount - 3));
          if (srcIdx >= path.length) continue;
          const src    = path[srcIdx];
          const len    = 12 + Math.random() * 22;
          const angle  = (Math.random() - 0.5) * Math.PI * 0.85;

          ctx.save();
          ctx.globalAlpha = 0.28 + Math.random() * 0.28;
          ctx.shadowColor = '#00c8ff';
          ctx.shadowBlur  = 10;
          ctx.strokeStyle = 'rgba(140, 220, 255, 0.85)';
          ctx.lineWidth   = 0.9;
          ctx.lineCap     = 'round';
          ctx.beginPath();
          ctx.moveTo(src[0], src[1]);
          let bx = src[0], by = src[1];
          for (let s = 0; s < 4; s++) {
            bx += Math.cos(angle) * (len / 4) + (Math.random() - 0.5) * 8;
            by += Math.sin(angle) * (len / 4) + (Math.random() - 0.5) * 8;
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Leading tip: hot white spark with corona ────────────────────────
      if (edgeProg < 1 && visibleCount > 0 && visibleCount < path.length) {
        const tip  = path[visibleCount];
        const prev = path[Math.max(0, visibleCount - 1)];
        ctx.save();
        // Outer corona
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 50;
        ctx.fillStyle   = 'rgba(180, 235, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], 7, 0, Math.PI * 2);
        ctx.fill();
        // Mid ring
        ctx.shadowBlur  = 20;
        ctx.fillStyle   = 'rgba(100, 210, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Hot core
        ctx.shadowBlur  = 8;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Corner node sparks at edge junctions ──────────────────────────────
    const corners        = [[0, 0], [W, 0], [W, H], [0, H]];
    const completedEdges = Math.floor(progress);
    for (let c = 0; c <= Math.min(completedEdges, 3); c++) {
      const pulse = 0.65 + Math.sin(Date.now() * 0.02 + c * 1.7) * 0.35;
      ctx.save();
      // Outer corona
      ctx.shadowColor = '#00e0ff';
      ctx.shadowBlur  = 35;
      ctx.fillStyle   = `rgba(0, 200, 255, ${0.30 * pulse})`;
      ctx.beginPath();
      ctx.arc(corners[c][0], corners[c][1], 10 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // Core node
      ctx.shadowBlur  = 15;
      ctx.fillStyle   = `rgba(0, 230, 255, ${0.90 * pulse})`;
      ctx.beginPath();
      ctx.arc(corners[c][0], corners[c][1], 4.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // Tiny orbiting sparks
      for (let s = 0; s < 4; s++) {
        const sa = (s / 4) * Math.PI * 2 + Date.now() * 0.006;
        const sr = 9 + pulse * 5;
        ctx.globalAlpha = 0.45 * pulse;
        ctx.fillStyle   = '#88eeff';
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.arc(corners[c][0] + Math.cos(sa) * sr, corners[c][1] + Math.sin(sa) * sr, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawConverge(t) {
    ctx.clearRect(0, 0, W, H);

    // Full border persists, fading as energy converges
    const edgeAlpha = Math.max(0, 1 - t * 0.7);
    ctx.globalAlpha = edgeAlpha;
    for (let e = 0; e < 4; e++) {
      const path = edgePaths[e];
      ctx.save();
      ctx.shadowColor = '#0088ff';
      ctx.shadowBlur  = 25;
      ctx.strokeStyle = 'rgba(0, 160, 255, 0.42)';
      ctx.lineWidth   = 6;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
      ctx.shadowColor = '#b0e0ff';
      ctx.shadowBlur  = 7;
      ctx.strokeStyle = 'rgba(200, 242, 255, 0.88)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    const cx = W * 0.5, cy = H * 0.5;

    // Converging spark streams
    sparks.forEach(s => {
      const px    = s.x + (s.tx - s.x) * t;
      const py    = s.y + (s.ty - s.y) * t;
      const alpha = 0.5 + t * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = '#b8eeff';
      ctx.beginPath();
      ctx.arc(px, py, s.size * (1 - t * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Trailing line to center as sparks approach
      if (t > 0.4) {
        const lineAlpha = (t - 0.4) / 0.6 * 0.42;
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = '#00ccff';
        ctx.shadowColor = '#00ccff';
        ctx.shadowBlur  = 9;
        ctx.lineWidth   = 0.85;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.restore();
      }
    });

    // ── Central energy orb ──────────────────────────────────────────────
    if (t > 0.2) {
      const intensity = (t - 0.2) / 0.8;
      const radius    = 3 + intensity * 55;

      // Base radial gradient
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0,    `rgba(250, 255, 255, ${Math.min(1, intensity * 1.1)})`);
      grad.addColorStop(0.18, `rgba(170, 220, 255, ${intensity * 0.95})`);
      grad.addColorStop(0.50, `rgba(50,  140, 255, ${intensity * 0.55})`);
      grad.addColorStop(0.80, `rgba(10,  50,  180, ${intensity * 0.22})`);
      grad.addColorStop(1,    'rgba(0,   10,  60,  0)');
      ctx.save();
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur  = 80 * intensity;
      ctx.fillStyle   = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Concentric pulse rings
      if (intensity > 0.35) {
        const ringIntensity = (intensity - 0.35) / 0.65;
        for (let r = 0; r < 3; r++) {
          const ringR = radius * (1.3 + r * 0.4);
          const alpha = ringIntensity * (0.5 - r * 0.14);
          if (alpha <= 0) continue;
          ctx.save();
          ctx.globalAlpha    = alpha;
          ctx.strokeStyle    = `rgba(80, 200, 255, 0.9)`;
          ctx.shadowColor    = '#00aaff';
          ctx.shadowBlur     = 18;
          ctx.lineWidth      = 1 - r * 0.25;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Hot bright core spike at peak
      if (intensity > 0.7) {
        const spike = (intensity - 0.7) / 0.3;
        ctx.save();
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 40 * spike;
        ctx.fillStyle   = `rgba(255, 255, 255, ${spike * 0.9})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 6 * spike, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function finishIntro() {
    flickerActive = false;
    if (rainRAF) cancelAnimationFrame(rainRAF);
    intro.classList.add('hidden');
    intro.style.display = 'none';
    document.body.style.overflow = '';
    const firstScene = document.querySelector('.story-scene');
    if (firstScene) gsap.set(firstScene, { opacity: 1 });
    ScrollTrigger.refresh();
  }

  // Handle resize during intro
  window.addEventListener('resize', () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    if (rainCanvas) { rainCanvas.width = W; rainCanvas.height = H; }
    edgePaths = edges.map(e => generateEdgePath(e));
  }, { passive: true });
}

// ─── BOOT ──────────────────────────────────────────────────────────────────
function init() {
  // Lock scroll immediately — initIntro will unlock it when animation ends
  document.body.style.overflow = 'hidden';
  initThree();
  initCursor();
  initScrollTrigger();
  window.addEventListener('resize', onResize);
  animate();
  initIntro();
}

init();