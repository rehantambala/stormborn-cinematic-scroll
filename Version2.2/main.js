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
    baseStrength : 1.05,
    flashStrength: 3.5,
    radius       : 0.55,
    threshold    : 0.22,
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

// ─── SCROLL SYSTEM (BULLETPROOF BIDIRECTIONAL) ─────────────────────────────
//
// Strategy: GSAP timeline is driven manually via tl.progress(p) from onUpdate.
// activeSceneIndex is derived purely from scroll progress — not from onStart/onEnter
// callbacks — so it works identically scrolling forward OR backward.
//
function initScrollTrigger() {
  const scenes = gsap.utils.toArray('.story-scene');
  if (!scenes.length) return;

  scenes.forEach((s, i) => ensureWarmOverlay(s, i));

  // Hide all scenes initially; we manage opacity via timeline scrub
  gsap.set(scenes, { opacity: 0, pointerEvents: 'none' });

  const N = scenes.length;
  const segment = 1 / N;

  // Build timeline: each scene fades in → holds → fades out
  const tl = gsap.timeline({ paused: true });

  scenes.forEach((sceneEl, i) => {
    // Crossfade overlap design:
    // Scene i holds from 0%→72% of its segment at full opacity.
    // At 72% it starts fading OUT over 28% of the segment.
    // Scene i+1 starts fading IN at EXACTLY that same 72% point.
    // Result: both scenes partially visible simultaneously — true cinematic crossfade, ZERO black gap.
    const start       = i * segment;
    const holdStart   = start + segment * 0.12;
    const fadeOutAt   = start + segment * 0.72;
    const overlapDur  = segment * 0.28;

    // Fade in fast
    tl.fromTo(sceneEl,
      { opacity: 0 },
      { opacity: 1, duration: segment * 0.12, ease: 'power2.inOut' },
      start
    );
    // Hold at full opacity
    tl.to(sceneEl,
      { opacity: 1, duration: segment * 0.60, ease: 'none' },
      holdStart
    );
    // Fade out — aligned with next scene's fade-in for overlap
    if (i < N - 1) {
      tl.to(sceneEl,
        { opacity: 0, duration: overlapDur, ease: 'power2.inOut' },
        fadeOutAt
      );
      // Pull next scene's fade-in back to align with this fade-out
      tl.fromTo(scenes[i + 1],
        { opacity: 0 },
        { opacity: 1, duration: overlapDur, ease: 'power2.inOut' },
        fadeOutAt
      );
    }

    // Parallax: background drifts slower than text overlay
    const bgEl  = sceneEl.querySelector('.scene-bg');
    const txtEl = sceneEl.querySelector('.story-text, .hero-text, .ero-text');
    if (bgEl)  tl.fromTo(bgEl,  { y: 0 }, { y: -28, ease: 'none', duration: segment }, start);
    if (txtEl) tl.fromTo(txtEl, { y: 0 }, { y: -10, ease: 'none', duration: segment }, start);

    // Final scene: slow zoom
    if (i === N - 1) {
      const img = sceneEl.querySelector('.scene-img');
      if (img) tl.fromTo(img, { scale: 1.0 }, { scale: 1.08, ease: 'power2.out', duration: segment * 0.7 }, holdStart);
    }
  });

  // ScrollTrigger drives the timeline
  ScrollTrigger.create({
    trigger : '#story',
    start   : 'top top',
    end     : `+=${N * 600}`,
    scrub   : 0.8,   // snappier response
    pin     : true,
    onUpdate(self) {
      const p = self.progress;
      scrollProgressValue = p;
      parallaxStrength    = 0.5 + p * 0.8;
      if (scrollProgressEl) scrollProgressEl.style.width = p * 100 + '%';

      // Manually scrub timeline — this is what makes reverse work
      tl.progress(p);

      // Derive active scene index from progress (works in BOTH directions).
      // We use 0.86 as threshold (centre of each scene's visible window) so
      // the active index flips right as the crossfade begins — feels natural.
      const raw = Math.min(N - 1, Math.floor(p * N + 0.14));
      if (raw !== activeSceneIndex) {
        activateScene(scenes, raw, activeSceneIndex);
      }
    },
  });

  // Activate scene 0 immediately (before any scroll)
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

// ─── BOOT ──────────────────────────────────────────────────────────────────
function init() {
  initThree();
  initCursor();
  initScrollTrigger();
  window.addEventListener('resize', onResize);
  animate();
}

init();
