import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.getElementById('skull-scene');
const heroLogos = document.querySelector('.hero__logos');
const badgeGrid = document.getElementById('badge-grid');
const orbitToggleButton = document.getElementById('toggle-orbit');
const shuffleButton = document.getElementById('shuffle-colors');
const resetButton = document.getElementById('reset-scene');
const downloadButton = document.getElementById('download-spec');
const fpsReadout = document.getElementById('fps-readout');
const logoCount = document.getElementById('logo-count');
const toast = document.querySelector('.toast');
const toastMessage = document.querySelector('.toast__message');
const toastDismiss = document.querySelector('.toast__dismiss');
const footerYear = document.getElementById('footer-year');

footerYear.textContent = new Date().getFullYear();
orbitToggleButton.setAttribute('aria-pressed', 'false');

const prefersReducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };
const isWebGLAvailable = (() => {
  try {
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!context;
  } catch (error) {
    console.warn('WebGL check failed', error);
    return false;
  }
})();

const BADGES = [
  {
    id: 'stellar-skull',
    name: 'Stellar Skull',
    description: 'Primary mark with holographic crown energy.',
    asset: 'images/logo-primary.svg',
    lore: 'The skull that powers every sticker drop. Emits a 45° ultraviolet beam when the beat hits.',
  },
  {
    id: 'wordmark',
    name: 'Wordmark Banner',
    description: 'Neon gradient logotype for your gear.',
    asset: 'images/logo-wordmark.svg',
    lore: 'Wave this banner at midnight to summon the neon courier. Works best on laptops and synth cases.',
  },
  {
    id: 'crew-badge',
    name: 'Rad Crew Emblem',
    description: 'Exclusive badge for limited-run collectors.',
    asset: 'images/logo-badge.svg',
    lore: 'Wear it during sticker swaps to unlock the glow vortex buff and automatic jaw clack sync.',
  },
];

logoCount.textContent = BADGES.length.toString();

const toastController = (() => {
  let timeoutId;
  const hide = () => {
    toast.setAttribute('hidden', '');
  };

  const show = (message, duration = 2800) => {
    toastMessage.textContent = message;
    toast.removeAttribute('hidden');
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      hide();
    }, duration);
  };

  toastDismiss.addEventListener('click', hide);
  toast.addEventListener('pointerenter', () => clearTimeout(timeoutId));
  toast.addEventListener('pointerleave', () => {
    timeoutId = window.setTimeout(() => hide(), 1500);
  });

  return { show, hide };
})();

const badgeElements = BADGES.map((badge) => {
  const img = new Image();
  img.src = badge.asset;
  img.alt = `${badge.name} sticker preview`;
  img.loading = 'lazy';
  const logoFigure = document.createElement('figure');
  logoFigure.className = 'hero__logo';
  logoFigure.setAttribute('role', 'listitem');
  logoFigure.appendChild(img);
  heroLogos.appendChild(logoFigure);

  const card = document.createElement('article');
  card.className = 'badge-card';
  card.setAttribute('role', 'listitem');

  const figure = document.createElement('div');
  const figureImg = new Image();
  figureImg.src = badge.asset;
  figureImg.alt = `${badge.name} sticker artwork`;
  figureImg.loading = 'lazy';
  figure.appendChild(figureImg);
  card.appendChild(figure);

  const heading = document.createElement('h3');
  heading.textContent = badge.name;
  card.appendChild(heading);

  const description = document.createElement('p');
  description.textContent = badge.description;
  card.appendChild(description);

  const lore = document.createElement('p');
  lore.textContent = badge.lore;
  lore.className = 'badge-card__lore';
  card.appendChild(lore);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = 'Pin to orbit';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `Pin ${badge.name} to orbit`);
  card.appendChild(button);

  badgeGrid.appendChild(card);

  return { badge, card, button };
});

let renderer;
let scene;
let camera;
let controls;
let skullGroup;
let orbitLogos;
let keyLight;
let rimLight;
let autoOrbit = true;
let currentLightIndex = 0;
let fpsSamples = [];
let lastFrameTime = performance.now();

const lightPresets = [
  { primary: 0x8264ff, rim: 0x00edff },
  { primary: 0xff6fea, rim: 0x6f45ff },
  { primary: 0x5cf4ff, rim: 0xffdd5f },
  { primary: 0x82ffb0, rim: 0x4d4dff },
  { primary: 0xffc16b, rim: 0x8c45ff },
];

const initRenderer = () => {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050319, 0.15);

  camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0.3, 1.4, 4.2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.2;
  controls.maxDistance = 6;
  controls.enablePan = false;
  controls.target.set(0, 0.4, 0);
  controls.update();

  const ambient = new THREE.AmbientLight(0x7877ff, 0.4);
  scene.add(ambient);

  keyLight = new THREE.SpotLight(0x8264ff, 2.1, 30, Math.PI / 4.2, 0.7, 1.2);
  keyLight.position.set(3.2, 4.6, 2.5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  rimLight = new THREE.PointLight(0x00edff, 1.4, 30);
  rimLight.position.set(-3.6, -2.8, -2.2);
  scene.add(rimLight);

  skullGroup = buildSkull();
  scene.add(skullGroup);

  orbitLogos = new THREE.Group();
  scene.add(orbitLogos);

  const loader = new THREE.TextureLoader();
  BADGES.forEach((badge, index) => {
    loader.load(
      badge.asset,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const geometry = new THREE.PlaneGeometry(0.9, 0.9);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(geometry, material);
        const angle = (index / BADGES.length) * Math.PI * 2;
        plane.position.set(Math.cos(angle) * 2.4, 0.4, Math.sin(angle) * 2.4);
        plane.lookAt(0, 0.4, 0);
        plane.userData = { index };
        orbitLogos.add(plane);
      },
      undefined,
      (error) => {
        console.error('Failed to load badge texture', badge.asset, error);
      }
    );
  });

  updateLightPreset(currentLightIndex);

  window.addEventListener('resize', handleResize);
  addMotionPreferenceListener();

  handleResize();
  animate();
};

const buildSkull = () => {
  const group = new THREE.Group();
  const registerMesh = (mesh) => {
    if (mesh.material && mesh.material.emissive) {
      mesh.userData.baseEmissive = mesh.material.emissive.clone();
      mesh.userData.baseEmissiveIntensity = mesh.material.emissiveIntensity;
    }
    group.add(mesh);
    return mesh;
  };
  const skullMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f6f2ff'),
    metalness: 0.2,
    roughness: 0.35,
    emissive: new THREE.Color('#1b103a'),
    emissiveIntensity: 0.22,
    flatShading: false,
  });

  const head = registerMesh(new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 3), skullMaterial));
  head.castShadow = true;
  head.receiveShadow = true;
  head.position.y = 0.5;

  const jaw = registerMesh(new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 0.55, 6, 24), skullMaterial));
  jaw.rotation.x = Math.PI * 0.5;
  jaw.position.set(0, -0.2, 0.18);

  const chin = registerMesh(new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.12, 16, 40, Math.PI), skullMaterial));
  chin.rotation.x = Math.PI;
  chin.position.set(0, -0.4, 0.32);

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0f0b24'),
    emissive: new THREE.Color('#00edff'),
    emissiveIntensity: 0.4,
  });

  const leftEye = registerMesh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), eyeMaterial));
  leftEye.position.set(-0.45, 0.48, 0.8);
  const rightEye = registerMesh(leftEye.clone());
  rightEye.position.x = 0.45;

  const nose = registerMesh(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 16), eyeMaterial));
  nose.rotation.x = Math.PI;
  nose.position.set(0, 0.28, 0.86);

  const teethMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d4ccff'),
    emissive: new THREE.Color('#2e1f63'),
    emissiveIntensity: 0.2,
  });

  for (let i = 0; i < 6; i += 1) {
    const tooth = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.2), teethMaterial));
    tooth.position.set((i - 2.5) * 0.22, -0.24, 0.9);
  }

  const browMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7f6fe6'),
    emissive: new THREE.Color('#6f45ff'),
    emissiveIntensity: 0.5,
  });

  const brow = registerMesh(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 12, 60), browMaterial));
  brow.position.set(0, 0.82, 0.1);

  const halo = registerMesh(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.04, 24, 100), new THREE.MeshBasicMaterial({
    color: 0x6f45ff,
    transparent: true,
    opacity: 0.3,
  })));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.5;

  return group;
};

const handleResize = () => {
  if (!renderer || !camera) return;
  const { clientWidth, clientHeight } = canvas;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
};

const handleMotionPreference = () => {
  if (prefersReducedMotion.matches) {
    setAutoOrbit(false);
    toastController.show('Reduced motion mode enabled. Tap reset to reanimate.');
  } else {
    setAutoOrbit(true);
  }
};

const addMotionPreferenceListener = () => {
  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', handleMotionPreference);
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(handleMotionPreference);
  }
};

const updateLightPreset = (index) => {
  if (!keyLight || !rimLight) return;
  const preset = lightPresets[index % lightPresets.length];
  keyLight.color.setHex(preset.primary);
  rimLight.color.setHex(preset.rim);
};

const animate = () => {
  if (!renderer || !scene || !camera) return;
  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;

  const fps = 1000 / Math.max(delta, 1);
  fpsSamples.push(fps);
  if (fpsSamples.length > 25) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
  fpsReadout.textContent = `${avgFps.toFixed(0)}`;

  if (autoOrbit && !prefersReducedMotion.matches) {
    skullGroup.rotation.y += 0.0035;
    orbitLogos.rotation.y -= 0.002;
  }

  controls.update();
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
};

const setAutoOrbit = (next) => {
  autoOrbit = next;
  orbitToggleButton.textContent = `Auto orbit: ${autoOrbit ? 'on' : 'off'}`;
  orbitToggleButton.setAttribute('aria-pressed', String(!autoOrbit));
};

const randomizeLights = () => {
  currentLightIndex = (currentLightIndex + 1) % lightPresets.length;
  updateLightPreset(currentLightIndex);
  const hue = Math.random();
  const saturation = 0.5 + Math.random() * 0.4;
  const lightness = 0.6 + Math.random() * 0.1;
  skullGroup.children.forEach((child) => {
    if (child.material && child.material.emissive) {
      child.material.emissive.setHSL(hue, saturation, lightness - 0.35);
      child.material.emissiveIntensity = 0.3 + Math.random() * 0.35;
    }
  });
  toastController.show('Glow palette shuffled.');
};

const resetScene = () => {
  currentLightIndex = 0;
  updateLightPreset(currentLightIndex);
  skullGroup.rotation.set(0, 0, 0);
  orbitLogos.rotation.set(0, 0, 0);
  skullGroup.children.forEach((child) => {
    if (child.material && child.material.emissive) {
      if (child.userData.baseEmissive) {
        child.material.emissive.copy(child.userData.baseEmissive);
      }
      if (typeof child.userData.baseEmissiveIntensity === 'number') {
        child.material.emissiveIntensity = child.userData.baseEmissiveIntensity;
      }
    }
  });
  controls.reset();
  setAutoOrbit(true);
  toastController.show('Scene reset.');
};

const pinBadge = (index) => {
  orbitLogos.rotation.y = -((index / BADGES.length) * Math.PI * 2);
  skullGroup.rotation.y = (index / BADGES.length) * Math.PI * 2;
  setAutoOrbit(false);
  badgeElements.forEach(({ card, button }, idx) => {
    const active = idx === index;
    card.classList.toggle('badge-card--active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  toastController.show(`${BADGES[index].name} pinned.`);
};

if (!isWebGLAvailable) {
  canvas.replaceWith(createFallbackIllustration());
  toastController.show('WebGL not available. Showing static render.');
} else {
  initRenderer();
}

prefersReducedMotion.matches && handleMotionPreference();

orbitToggleButton.addEventListener('click', () => {
  setAutoOrbit(!autoOrbit);
  toastController.show(`Auto orbit ${autoOrbit ? 'enabled' : 'paused'}.`);
});

shuffleButton.addEventListener('click', () => {
  if (!scene) return;
  randomizeLights();
});

resetButton.addEventListener('click', () => {
  if (!scene) return;
  resetScene();
});

badgeElements.forEach(({ button }, index) => {
  button.addEventListener('click', () => {
    if (!scene) return;
    pinBadge(index);
  });
});

downloadButton.addEventListener('click', () => {
  const spec = {
    title: 'Skelly Stickers Lab Spec',
    version: '1.0.0',
    assets: BADGES.map(({ name, asset }) => ({ name, asset })),
    instructions: [
      'Use the GLTF skull for lighting tests and sticker visualization.',
      'Orbit logos by adjusting the `orbitLogos.rotation` property.',
      'Keep auto orbit disabled when composing still renders.',
    ],
  };
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'skelly-stickers-lab-spec.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toastController.show('Spec sheet downloaded.');
});

function createFallbackIllustration() {
  const wrapper = document.createElement('div');
  wrapper.className = 'hero__fallback';
  wrapper.innerHTML = `
    <img src="images/logo-primary.svg" alt="Skelly skull illustration" />
    <p>Interactive viewer requires WebGL. Here is a static preview.</p>
  `;
  return wrapper;
}

// Provide pointer parallax for extra depth when orbit is active
canvas.addEventListener('pointermove', (event) => {
  if (!scene || !skullGroup || prefersReducedMotion.matches) return;
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  skullGroup.rotation.x = THREE.MathUtils.lerp(skullGroup.rotation.x, y * 0.4, 0.05);
  skullGroup.rotation.z = THREE.MathUtils.lerp(skullGroup.rotation.z, x * 0.4, 0.05);
});

function createBadgeIntersectionObserver() {
  if (typeof window.IntersectionObserver !== 'function') {
    badgeElements.forEach(({ card }) => card.classList.add('badge-card--visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('badge-card--visible');
        }
      });
    },
    { threshold: 0.35 }
  );

  badgeElements.forEach(({ card }) => observer.observe(card));
}

createBadgeIntersectionObserver();
