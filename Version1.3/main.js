/**
 * Thor Cinematic - Marvel Storm Experience (IMPROVED)
 * Three.js storm sky + GSAP ScrollTrigger + custom cursor
 * IMPROVED: Smooth crossfade transitions with NO black screens
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// --- Config ---
const CONFIG = {
  lightning: {
    calmIntervalSeconds: [4, 6],
    intenseIntervalSeconds: [2, 3],
    branchDepth: 5,
    boltSegments: 18,
    boltCount: 8,
  },
  cursor: {
    trailCount: 12,
    trailDecay: 0.92,
  },
  bloom: {
    baseStrength: 1.05,
    flashStrength: 2.8, // IMPROVED: Reduced for smoother flash
    radius: 0.55,
    threshold: 0.22,
  },
  storm: {
    cloudLayers: 12,
    fogDensity: 0.018,
  },
};

// --- DOM ---
const container = document.getElementById('canvas-container');
const cursorDot = document.getElementById('cursor-dot');
const cursorBolt = document.getElementById('cursor-bolt');
const cursorParticles = document.getElementById('cursor-particles');
const thunderFlash = document.getElementById('thunder-flash');
const lightningStrikeOverlay = document.getElementById('lightning-strike-overlay');
const massiveLightningStrike = document.getElementById('massive-lightning-strike');
const transitionBolt = document.getElementById('transition-bolt');
const scrollProgress = document.getElementById('scroll-progress');

// --- State ---
let scene, camera, renderer, composer, bloomPass, afterimagePass;
let stormClouds = [];
let lightningBolts = [];
let flashLight;
let clock;
let mouse = { x: 0, y: 0 };
let cursorTrail = [];
let isFlashActive = false;

// --- Three.js Scene ---
function initThree() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030308);
  scene.fog = new THREE.FogExp2(0x050a12, CONFIG.storm.fogDensity);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Dark storm lighting
  const ambient = new THREE.AmbientLight(0x060c18, 0.35);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0x2a4a6a, 0.25);
  keyLight.position.set(5, 5, 10);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x1a3a5a, 0.2, 80);
  fillLight.position.set(-5, -2, 8);
  scene.add(fillLight);
  flashLight = new THREE.AmbientLight(0xffffff, 0);
  scene.add(flashLight);

  createStormClouds();
  createLightningBolts();

  // Postprocessing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.baseStrength,
    CONFIG.bloom.radius,
    CONFIG.bloom.threshold
  );
  composer.addPass(bloomPass);
  afterimagePass = new AfterimagePass(0.92);
  composer.addPass(afterimagePass);
}

function createStormClouds() {
  const layerCount = CONFIG.storm.cloudLayers;
  for (let i = 0; i < layerCount; i++) {
    const depth = i / layerCount;
    const z = -20 - depth * 55 - Math.random() * 15;
    const w = 100 + Math.random() * 80;
    const h = 50 + Math.random() * 50;
    const cloudGeo = new THREE.PlaneGeometry(w, h, 12, 6);
    const opacity = 0.10 + depth * 0.16 + Math.random() * 0.08;
    const cloudMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.62, 0.35, 0.03 + depth * 0.03),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    const baseX = (Math.random() - 0.5) * 80;
    const baseY = (Math.random() - 0.5) * 50;
    cloud.position.set(baseX, baseY, z);
    cloud.rotation.x = Math.PI * (0.05 + Math.random() * 0.1);
    cloud.rotation.z = (Math.random() - 0.5) * 0.2;
    cloud.scale.setScalar(0.7 + Math.random() * 0.6);
    scene.add(cloud);
    const speed = 0.004 + depth * 0.01 + Math.random() * 0.006;
    const parallaxFactor = 0.3 + depth * 0.9;
    stormClouds.push({
      mesh: cloud,
      baseX,
      baseY,
      baseZ: z,
      speed,
      parallaxFactor,
    });
  }

  // Deep fog layers
  for (let i = 0; i < 3; i++) {
    const fogGeo = new THREE.PlaneGeometry(180, 100, 1, 1);
    const fogMat = new THREE.MeshBasicMaterial({
      color: 0x03060c,
      transparent: true,
      opacity: 0.08 + i * 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fogPlane = new THREE.Mesh(fogGeo, fogMat);
    fogPlane.position.z = -35 - i * 25;
    scene.add(fogPlane);
    stormClouds.push({
      mesh: fogPlane,
      baseX: 0,
      baseY: 0,
      baseZ: fogPlane.position.z,
      speed: 0.005,
      parallaxFactor: 0.2,
    });
  }
}

function createLightningBoltSegment(segments, spreadX = 2.5, spreadY = 3) {
  const points = [new THREE.Vector3(0, 0, 0)];
  let x = 0, y = 0;
  for (let i = 0; i < segments; i++) {
    x += (Math.random() - 0.5) * spreadX;
    y += (Math.random() - 0.4) * spreadY - 0.5;
    points.push(new THREE.Vector3(x, y, 0));
  }
  return points;
}

function buildBranchingBolt(mainSegments, branchDepth, scale = 1) {
  const segments = [];
  const mainPoints = createLightningBoltSegment(mainSegments, 3, 4);
  segments.push(mainPoints);

  for (let b = 0; b < branchDepth; b++) {
    const branchFrom = mainPoints[Math.floor(mainPoints.length * (0.3 + Math.random() * 0.5))];
    if (!branchFrom) continue;
    const branchPoints = createLightningBoltSegment(4 + Math.floor(Math.random() * 4), 2, 2);
    branchPoints.forEach((p, i) => {
      if (i === 0) return;
      p.x = branchFrom.x + p.x * scale;
      p.y = branchFrom.y + p.y * scale;
    });
    segments.push(branchPoints);
  }

  const allPoints = segments.flat();
  const geometry = new THREE.BufferGeometry().setFromPoints(allPoints);
  const material = new THREE.LineBasicMaterial({
    color: 0xe8f4ff,
    transparent: true,
    opacity: 1,
    linewidth: 2,
  });
  return { geometry, material, segments };
}

function createLightningBolts() {
  const positions = [
    [-18, 10, -18], [18, 6, -22], [-10, -6, -20], [14, -8, -24],
    [0, 12, -16], [-14, 0, -19], [8, 10, -21], [-6, -10, -23],
  ];
  for (let i = 0; i < CONFIG.lightning.boltCount; i++) {
    const pos = positions[i] || [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 25, -20 - Math.random() * 10];
    const { geometry, material } = buildBranchingBolt(
      CONFIG.lightning.boltSegments,
      CONFIG.lightning.branchDepth,
      1.2 + Math.random() * 0.8
    );
    const bolt = new THREE.Line(geometry, material);
    bolt.position.set(pos[0], pos[1], pos[2]);
    bolt.scale.setScalar(1.2 + Math.random() * 0.8);
    bolt.visible = false;
    bolt.userData.basePos = [...pos];
    scene.add(bolt);
    lightningBolts.push(bolt);
  }
}

function updateStormClouds(parallax = 1, scrollProgressVal = 0) {
  const t = clock.getElapsedTime();
  const scrollOffsetX = (scrollProgressVal - 0.5) * 25;
  stormClouds.forEach(({ mesh, baseX, baseY, baseZ, speed, parallaxFactor }) => {
    const p = parallax * parallaxFactor;
    mesh.position.x = baseX + Math.sin(t * speed * p) * 5 + scrollOffsetX * (parallaxFactor * 0.7);
    mesh.position.y = baseY + Math.sin(t * speed * 0.6 * p) * 3;
    mesh.position.z = baseZ + Math.cos(t * speed * 0.5 * p) * 2;
  });
}

// IMPROVED: Longer, smoother lightning flash
function flashRandomLightning() {
  const bolt = lightningBolts[Math.floor(Math.random() * lightningBolts.length)];
  if (!bolt) return;
  bolt.visible = true;
  bolt.material.opacity = 0.9 + Math.random() * 0.1;
  // IMPROVED: Longer duration for smoother feel
  setTimeout(() => { bolt.visible = false; }, 120 + Math.random() * 80);
}

function runScreenShake() {
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 500);
}

// IMPROVED: Smoother thunder flash with longer duration
function runThunderFlash() {
  if (!thunderFlash) return;
  thunderFlash.style.opacity = '0.7';
  gsap.to(thunderFlash, { opacity: 0, duration: 0.4, ease: 'power2.out' });
}

// IMPROVED: Smoother scene flash with reduced intensity
function triggerSceneFlash() {
  if (isFlashActive) return;
  isFlashActive = true;

  if (thunderFlash) {
    thunderFlash.style.opacity = '0.85';
    gsap.to(thunderFlash, { opacity: 0, duration: 0.45, ease: 'power2.out' });
  }

  if (flashLight) flashLight.intensity = 0.7; // IMPROVED: Reduced intensity
  renderer.toneMappingExposure = 1.1; // IMPROVED: Reduced exposure
  bloomPass.strength = CONFIG.bloom.flashStrength;

  // IMPROVED: Longer recovery time for smoother transition
  setTimeout(() => {
    if (flashLight) flashLight.intensity = 0;
    renderer.toneMappingExposure = 0.5;
    bloomPass.strength = CONFIG.bloom.baseStrength;
    isFlashActive = false;
  }, 220);
}

// IMPROVED: Smoother transition strike
function playTransitionStrike(intense = false) {
  // 3D lightning in the storm sky
  flashRandomLightning();
  if (intense) {
    setTimeout(() => flashRandomLightning(), 110 + Math.random() * 90);
  }

  // Global flash + exposure bump
  triggerSceneFlash();

  // Thunder overlay
  runThunderFlash();
  
  // Only shake on intense transitions
  if (intense) {
    runScreenShake();
  }

  // IMPROVED: Smoother diagonal bolt with longer duration
  if (transitionBolt) {
    gsap.fromTo(
      transitionBolt,
      { opacity: 0, xPercent: -60 },
      {
        opacity: 1,
        xPercent: 40,
        duration: 0.25, // IMPROVED: Longer duration
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(transitionBolt, { opacity: 0, duration: 0.15, ease: 'power2.in' });
        },
      }
    );
  }
}

// --- Custom Cursor ---
function initCursor() {
  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (cursorDot) {
      cursorDot.style.left = e.clientX + 'px';
      cursorDot.style.top = e.clientY + 'px';
    }
    if (cursorBolt) {
      cursorBolt.style.left = e.clientX + 20 + 'px';
      cursorBolt.style.top = e.clientY + 20 + 'px';
    }
    cursorTrail.push({ x: e.clientX, y: e.clientY, life: 1 });
    if (cursorTrail.length > CONFIG.cursor.trailCount) cursorTrail.shift();
  });

  setInterval(() => {
    cursorTrail = cursorTrail
      .map((p) => ({ ...p, life: p.life * CONFIG.cursor.trailDecay }))
      .filter((p) => p.life > 0.05);
    if (!cursorParticles) return;
    cursorTrail.forEach((p, i) => {
      let el = cursorParticles.querySelector(`[data-id="${i}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'cursor-spark';
        el.setAttribute('data-id', i);
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = '6px';
        el.style.height = '6px';
        el.style.borderRadius = '50%';
        el.style.background = 'rgba(0, 212, 255, 0.9)';
        el.style.boxShadow = '0 0 10px #00d4ff';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '9996';
        cursorParticles.appendChild(el);
      }
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.opacity = p.life;
      el.style.transform = `translate(-50%, -50%) scale(${p.life})`;
    });
  }, 50);
}

// --- IMPROVED: GSAP ScrollTrigger with CROSSFADE transitions ---
function initScrollTrigger() {
  const scenes = gsap.utils.toArray('.story-scene');
  if (!scenes.length) return;

  // Initial state: only first scene visible
  gsap.set(scenes, { opacity: 0, pointerEvents: 'none' });
  gsap.set(scenes[0], { opacity: 1, pointerEvents: 'auto' });
  scenes[0].classList.add('active');
  window.__activeSceneIndex = 0;

  // IMPROVED: Longer scroll distance for smoother feel
  const scrollDistance = scenes.length * 1200;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#story',
      start: 'top top',
      end: `+=${scrollDistance}`,
      scrub: 1.2, // IMPROVED: Slightly higher scrub for smoother motion
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        const progress = self.progress;
        if (scrollProgress) scrollProgress.style.width = progress * 100 + '%';

        // Subtle camera movement
        const z = 18 - progress * 2;
        camera.position.z = z;
        camera.lookAt(0, 0, 0);

        window.__scrollProgress = progress;
        window.__parallax = 0.5 + progress * 0.5;
      },
    },
  });

  const segmentDuration = 1 / scenes.length;

  scenes.forEach((scene, index) => {
    const isFirst = index === 0;
    const isLast = index === scenes.length - 1;
    
    const sceneStart = segmentDuration * index;
    // IMPROVED: Overlap for crossfade - fade in starts before previous fades out
    const fadeInStart = sceneStart - segmentDuration * 0.15; // Start 15% earlier
    const fadeInEnd = sceneStart + segmentDuration * 0.5; // Complete at 50%
    const fadeOutStart = sceneStart + segmentDuration * 0.5; // Start fading out at 50%
    const fadeOutEnd = sceneStart + segmentDuration + segmentDuration * 0.15; // End 15% into next

    // Lightning strike for transitions (except first)
    if (!isFirst) {
      tl.call(() => {
        const isIntense = index >= 4;
        playTransitionStrike(isIntense);
      }, null, sceneStart);
    }

    // IMPROVED: Crossfade - fade in with overlap
    if (!isFirst) {
      tl.fromTo(
        scene,
        { opacity: 0 },
        {
          opacity: 1,
          duration: segmentDuration * 0.65, // IMPROVED: Longer fade duration
          ease: 'power2.inOut',
          onStart: () => {
            scenes.forEach((s) => s.classList.remove('active'));
            scene.classList.add('active');
            gsap.set(scenes, { pointerEvents: 'none' });
            gsap.set(scene, { pointerEvents: 'auto' });
            window.__activeSceneIndex = index;
          },
        },
        fadeInStart
      );
    }

    // IMPROVED: Fade out overlaps with next scene fade in
    if (!isLast) {
      tl.to(
        scene,
        {
          opacity: 0,
          duration: segmentDuration * 0.65, // IMPROVED: Longer fade duration
          ease: 'power2.inOut',
        },
        fadeOutStart
      );
    }
  });
}

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const parallax = window.__parallax || 1;

  const scrollProgressVal = window.__scrollProgress || 0;
  const stormIntensity = scrollProgressVal > 0.5 ? 0.5 + (scrollProgressVal - 0.5) * 1.2 : 1;
  updateStormClouds(parallax * stormIntensity, scrollProgressVal);

  lightningBolts.forEach((bolt) => {
    if (!bolt.visible || !bolt.userData.basePos) return;
    const scrollX = (scrollProgressVal - 0.5) * 6;
    bolt.position.x = bolt.userData.basePos[0] + scrollX * 0.5;
  });

  // Subtle bloom pulse
  if (!isFlashActive) {
    bloomPass.strength = CONFIG.bloom.baseStrength + Math.sin(t * 0.4) * 0.15;
  }
  
  composer.render();
}

// --- Resize ---
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bloomPass.resolution.set(w, h);
  if (afterimagePass) afterimagePass.setSize(w, h);
}

// --- Init ---
function init() {
  initThree();
  initCursor();
  initScrollTrigger();
  window.addEventListener('resize', onResize);
  animate();
}

init();
