import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const host = document.getElementById('assembly-canvas');
const heroHost = document.getElementById('hero-canvas');
const chapters = [...document.querySelectorAll('.assembly-chapter')];
const status = document.getElementById('assembly-status');
const number = document.getElementById('assembly-number');
const progressBar = document.querySelector('#assembly-progress i');
let assemblyVisible = false, heroVisible = true;
new IntersectionObserver(([entry]) => { assemblyVisible = entry.isIntersecting; }, { rootMargin: '100px' }).observe(document.getElementById('assembly-visual'));
new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }, { rootMargin: '100px' }).observe(document.querySelector('.hero-intro'));
const guide = document.getElementById('assembly-guide');
const guidePath = guide.querySelector('path');
const guideDot = guide.querySelector('circle');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (v) => v * v * (3 - 2 * v);
const state = { progress: 0, target: 0, step: 0, expanded: 0, expandTarget: 0 };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
host.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0xdad4ce, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 5, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, .55);
rim.position.set(-4, 1, -3);
scene.add(rim);

let model, pieces = [], center = new THREE.Vector3(), extent = 1;
let heroRenderer, heroScene, heroCamera, heroModel, lowHeroModel, heroGloss, glossMaterials = [], heroHemi, heroKey, heroFill, heroScreenLights = [], eyes;
const reflectionTargets = [0, 1, 2].map(() => new THREE.Color(0xffe7cf));
const normalPixels = new Uint8Array(64 * 64 * 4);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const i = (y * 64 + x) * 4;
  normalPixels[i] = 128 + Math.round(5 * Math.sin(x * .59 + y * .31));
  normalPixels[i + 1] = 128 + Math.round(5 * Math.cos(y * .67 - x * .24));
  normalPixels[i + 2] = 255;
  normalPixels[i + 3] = 255;
}
const plasticNormal = new THREE.DataTexture(normalPixels, 64, 64, THREE.RGBAFormat);
plasticNormal.wrapS = plasticNormal.wrapT = THREE.RepeatWrapping;
plasticNormal.repeat.set(8, 8);
plasticNormal.generateMipmaps = true;
plasticNormal.minFilter = THREE.LinearMipmapLinearFilter;
plasticNormal.needsUpdate = true;
const plasticMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0xfaf9f6, roughness: .27, metalness: .025, clearcoat: .62,
  clearcoatRoughness: .13, normalMap: plasticNormal, envMapIntensity: .62,
  normalScale: new THREE.Vector2(.08, .08), side: THREE.DoubleSide,
  transparent: true, opacity: 0, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});
let studioEnv;
function ensureStudioReflections() {
  if (studioEnv || !heroRenderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#aaa9a4');
  gradient.addColorStop(.52, '#ddd3c7');
  gradient.addColorStop(1, '#50515a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 128);
  context.filter = 'blur(12px)';
  context.fillStyle = '#fffdf4';
  context.fillRect(35, 17, 34, 85);
  context.fillRect(184, 8, 16, 99);
  context.filter = 'none';
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const generator = new THREE.PMREMGenerator(heroRenderer);
  studioEnv = generator.fromEquirectangular(texture).texture;
  generator.dispose();
  texture.dispose();
  glossMaterials.forEach((material) => { material.envMap = studioEnv; material.needsUpdate = true; });
}
const reflectionCanvas = document.createElement('canvas');
reflectionCanvas.width = 16; reflectionCanvas.height = 9;
const reflectionContext = reflectionCanvas.getContext('2d', { willReadFrequently: true });
let lastReflection = 0;
const heroOrbit = { yaw: -.45, pitch: -.06, pointer: null, x: 0, y: 0, moved: false };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coverCanvas = document.createElement('canvas');
coverCanvas.width = 2;
coverCanvas.height = 2;
coverCanvas.getContext('2d').fillRect(0, 0, 2, 2);
const coverTexture = new THREE.CanvasTexture(coverCanvas);
coverTexture.colorSpace = THREE.SRGBColorSpace;
coverTexture.flipY = true;
const film = {
  pose: 0, target: 0, screen: 0, solid: 0, playAlpha: 0, lastTime: 0,
  yaw0: heroOrbit.yaw, pitch0: heroOrbit.pitch, stage: false, boost: 1, shiftX: 0, shiftY: 0,
  face: null, eyes: null, material: null, coverReady: false, playing: false, rewound: true,
  faceLocal: new THREE.Vector3(), faceSize: new THREE.Vector3(1, .6, .05), faceForward: new THREE.Vector3(0, 0, 1),
  videoAspect: 16 / 9,
  video: document.getElementById('hero-film-video'),
  play: document.getElementById('hero-film-play'),
  exit: document.getElementById('hero-film-exit'),
  intro: document.querySelector('.hero-intro'),
  product: document.querySelector('.hero-product'),
  cover: coverTexture,
};
const filmMaterial = new THREE.ShaderMaterial({
  uniforms: {
    map: { value: coverTexture }, reveal: { value: 0 }, solid: { value: 0 },
    faceAspect: { value: 1.6 }, videoAspect: { value: 16 / 9 },
  },
  vertexShader: `varying vec2 vUv; varying float vFacing;
  void main(){vUv=uv;vFacing=normalize(normalMatrix*normal).z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D map;uniform float reveal;uniform float solid;uniform float faceAspect;uniform float videoAspect;
  varying vec2 vUv;varying float vFacing;
  vec3 tap(vec2 uv){return texture2D(map,clamp(uv,0.001,0.999)).rgb;}
  vec3 soft(vec2 uv,float r){
    vec2 o=vec2(r/max(videoAspect,0.2),r);
    vec3 c=tap(uv)*0.28;
    c+=tap(uv+vec2(o.x,0.0))*0.12; c+=tap(uv-vec2(o.x,0.0))*0.12;
    c+=tap(uv+vec2(0.0,o.y))*0.12; c+=tap(uv-vec2(0.0,o.y))*0.12;
    c+=tap(uv+o)*0.06; c+=tap(uv-o)*0.06;
    c+=tap(uv+vec2(o.x,-o.y))*0.06; c+=tap(uv+vec2(-o.x,o.y))*0.06;
    return c;
  }
  void main(){
    if(vFacing<0.08) discard;
    float facing=smoothstep(0.08,0.62,vFacing);
    vec2 contain=vec2(min(1.0,videoAspect/max(faceAspect,0.2)), min(1.0,max(faceAspect,0.2)/max(videoAspect,0.2)));
    vec2 span=contain*0.7;
    vec2 delta=vUv-0.5;
    float outside=length(max(abs(delta)-span*0.5,0.0));
    vec2 sampleUv=clamp(delta/span+0.5,0.0,1.0);
    float edge=smoothstep(0.0,0.18,outside);
    vec3 color=tap(sampleUv);
    if(edge>0.001) color=mix(color,soft(sampleUv,mix(0.012,0.08,edge)),edge);
    vec2 grid=vec2(vUv.x*max(faceAspect,0.2), vUv.y)*46.0;
    float rnd=fract(sin(dot(floor(grid),vec2(127.1,311.7)))*43758.5453);
    float radius=mix(0.0,0.47,smoothstep(rnd*0.22,1.0,reveal));
    float dots=1.0-smoothstep(radius,radius+0.05,length(fract(grid)-0.5));
    float mask=mix(dots,1.0,solid);
    float alpha=mask*facing*smoothstep(0.0,0.18,reveal);
    if(alpha<0.02) discard;
    gl_FragColor=vec4(color,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
  side: THREE.FrontSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
});
film.material = filmMaterial;
const poseSeconds = () => reducedMotion.matches ? .28 : 1.35;
const screenInSeconds = () => reducedMotion.matches ? .2 : .95;
const screenOutSeconds = () => reducedMotion.matches ? .25 : 1.25;
function resizeHero() {
  if (!heroRenderer || !heroCamera) return;
  const { width, height } = heroHost.getBoundingClientRect();
  if (!width || !height) return;
  heroRenderer.setSize(width, height, false);
  heroCamera.aspect = width / height;
  heroCamera.updateProjectionMatrix();
}
function enterStage() {
  if (film.stage || !heroRenderer || !film.product) return;
  ensureStudioReflections();
  const before = heroHost.getBoundingClientRect();
  film.product.classList.add('is-stage');
  const after = heroHost.getBoundingClientRect();
  heroRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  resizeHero();
  film.boost = before.height > 2 ? after.height / before.height : 1;
  film.shiftX = (before.left + before.width / 2) - (after.left + after.width / 2);
  film.shiftY = (before.top + before.height / 2) - (after.top + after.height / 2);
  film.stage = true;
}
function leaveStage() {
  if (!film.stage) return;
  film.product.classList.remove('is-stage');
  film.stage = false;
  film.boost = 1;
  heroRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  resizeHero();
}
function silenceFilm() {
  film.playToken = (film.playToken || 0) + 1;
  film.playing = false;
  film.video.pause();
  film.video.muted = true;
  film.intro.classList.remove('film-playing', 'film-buffering');
}
function finishFilm() {
  silenceFilm();
  film.pose = 0;
  film.screen = 0;
  film.solid = 0;
  film.playAlpha = 0;
  film.video.volume = 1;
  film.material.uniforms.map.value = coverTexture;
  film.material.uniforms.reveal.value = 0;
  if (!film.rewound) {
    film.video.currentTime = 0;
    film.rewound = true;
  }
  film.intro.classList.remove('film-open', 'film-playing', 'film-exit-ready', 'film-play-ready');
  document.documentElement.style.setProperty('--film-dark', '0');
  leaveStage();
}
function setFilm(open) {
  if (!film.intro) return;
  if (open) {
    if (!heroModel) return;
    if (film.pose < .04) {
      film.yaw0 = heroOrbit.yaw;
      film.pitch0 = heroOrbit.pitch;
    }
    film.rewound = false;
    enterStage();
    film.target = 1;
    film.intro.classList.add('film-open');
    heroHost?.setAttribute('aria-expanded', 'true');
    return;
  }
  silenceFilm();
  film.target = 0;
  heroHost?.setAttribute('aria-expanded', 'false');
}
function playFilm() {
  if (film.target !== 1 || film.pose < 1 || film.playing) return;
  const token = film.playToken = (film.playToken || 0) + 1;
  if (!film.video.src) {
    film.video.src = film.video.dataset.src;
    film.video.load();
  }
  film.intro.classList.add('film-buffering');
  const texture = film.videoTexture ??= new THREE.VideoTexture(film.video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.needsUpdate = true;
  film.material.uniforms.map.value = texture;
  film.video.muted = false;
  film.video.volume = 1;
  film.video.play().then(() => {
    if (token !== film.playToken || film.target !== 1) {
      film.video.pause();
      film.video.muted = true;
      return;
    }
    film.playing = true;
    film.intro.classList.add('film-playing');
  }).catch(() => {
    if (token !== film.playToken) return;
    film.playing = false;
    film.material.uniforms.map.value = coverTexture;
    film.intro.classList.remove('film-playing', 'film-buffering');
  });
}
const coverImage = new Image();
coverImage.onload = () => {
  coverCanvas.width = coverImage.naturalWidth;
  coverCanvas.height = coverImage.naturalHeight;
  coverCanvas.getContext('2d').drawImage(coverImage, 0, 0);
  coverTexture.needsUpdate = true;
  film.coverReady = true;
  film.videoAspect = coverImage.naturalWidth / coverImage.naturalHeight;
};
coverImage.src = 'assets/tada-film-poster.jpg';
document.body.append(film.exit);
film.exit.addEventListener('click', () => setFilm(false));
film.play.addEventListener('click', playFilm);
film.video.addEventListener('ended', () => {
  film.playing = false;
  film.intro.classList.remove('film-playing', 'film-buffering');
  film.material.uniforms.map.value = coverTexture;
});
film.video.addEventListener('waiting', () => film.intro.classList.add('film-buffering'));
film.video.addEventListener('playing', () => film.intro.classList.remove('film-buffering'));
film.video.addEventListener('loadedmetadata', () => {
  if (film.video.videoWidth) film.videoAspect = film.video.videoWidth / film.video.videoHeight;
});
addEventListener('keydown', (event) => { if (event.key === 'Escape' && (film.target || film.pose > 0)) setFilm(false); });
addEventListener('craboo:page', () => { if (document.body.dataset.page !== 'home') finishFilm(); });
const sections = [
  { indices: new Set([...Array.from({ length: 6 }, (_, i) => i + 6), 14, 15, ...Array.from({ length: 48 }, (_, i) => i + 18)]), step: 1, offset: new THREE.Vector3(0, -1.15, 0) },
  { indices: new Set([12, 16]), step: 2, offset: new THREE.Vector3(0, 1.15, 0) },
  { indices: new Set([2, 13, 17, 66]), step: 3, offset: new THREE.Vector3(1.2, 0.1, 0) },
  { indices: new Set([0, 1]), step: 4, offset: new THREE.Vector3(0, 0, 1.1) },
  { indices: new Set([3, 4, 5]), step: 5, offset: new THREE.Vector3(0, 1.25, 0) },
];
const legClusters = [[6, 7, 8, 10, 11, 14, 15], [9, ...Array.from({ length: 13 }, (_, i) => i + 18)], Array.from({ length: 9 }, (_, i) => i + 31), Array.from({ length: 8 }, (_, i) => i + 40), Array.from({ length: 9 }, (_, i) => i + 48), Array.from({ length: 9 }, (_, i) => i + 57)];
function explosionOffset(index, step) {
  if (step === 1) {
    const leg = legClusters.findIndex((cluster) => cluster.includes(index));
    const angle = (Math.max(0, leg) / 6) * Math.PI * 2 + Math.PI / 6;
    return new THREE.Vector3(Math.cos(angle) * .58, leg % 2 ? -.17 : .16, Math.sin(angle) * .52);
  }
  if (step === 2) return new THREE.Vector3(0, index === 12 ? -.52 : .56, index === 12 ? -.2 : .15);
  if (step === 3) return new THREE.Vector3([13].includes(index) ? -.95 : .95, 0, .15);
  if (step === 4) return new THREE.Vector3(0, index === 0 ? .1 : -.1, index === 0 ? .8 : 1.15);
  return new THREE.Vector3(index === 3 ? -.15 : index === 4 ? .6 : .3, index === 5 ? 1.55 : index === 4 ? .9 : .85, index === 5 ? -.3 : .1);
}
function sectionOf(index) {
  return sections.find((group) => group.indices?.has(index) || (index >= group.from && index <= group.to)) || sections[1];
}
function whiteMaterial(step, face) {
  if (face) return new THREE.MeshStandardMaterial({ color: 0x211916, roughness: 1, metalness: 0, transparent: true, side: THREE.DoubleSide });
  const shades = [0, 0xfaf9f6, 0xffffff, 0xffffff, 0xffffff, 0xffffff];
  return new THREE.MeshToonMaterial({ color: shades[step], transparent: true, side: THREE.DoubleSide, depthWrite: true });
}

heroRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
heroRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
heroRenderer.outputColorSpace = THREE.SRGBColorSpace;
heroRenderer.toneMapping = THREE.ACESFilmicToneMapping;
heroRenderer.toneMappingExposure = 1.45;
heroRenderer.setClearColor(0x000000, 0);
heroHost.append(heroRenderer.domElement);
heroScene = new THREE.Scene();
heroHemi = new THREE.HemisphereLight(0xffffff, 0xdad4ce, 1.05);
heroScene.add(heroHemi);
heroKey = new THREE.DirectionalLight(0xffffff, 1.4);
heroKey.position.set(3, 5, 5);
heroScene.add(heroKey);
heroFill = new THREE.DirectionalLight(0xe8f0ff, 0);
heroFill.position.set(-3, 2, 2);
heroScene.add(heroFill);
for (let i = 0; i < 3; i++) {
  const light = new THREE.PointLight(0xffe7cf, 0, 1.8, 2);
  heroScene.add(light);
  heroScreenLights.push(light);
}
heroCamera = new THREE.PerspectiveCamera(32, 1, .01, 100);
new ResizeObserver(resizeHero).observe(heroHost);
resizeHero();
const previewLoader = new GLTFLoader();
previewLoader.load('assets/craboo-low.glb', ({ scene: preview }) => {
  if (heroModel) return;
  lowHeroModel = preview;
  const bounds = new THREE.Box3().setFromObject(preview);
  const previewCenter = bounds.getCenter(new THREE.Vector3());
  const previewExtent = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  preview.position.sub(previewCenter);
  preview.position.y += previewExtent * .2;
  preview.traverse((part) => { if (part.isMesh) part.material = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide }); });
  heroScene.add(preview);
});

new GLTFLoader().load('assets/craboo.glb', ({ scene: source }) => {
  model = source;
  const bounds = new THREE.Box3().setFromObject(model);
  bounds.getCenter(center);
  extent = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  model.position.sub(center);
  scene.add(model);
  source.children.forEach((mesh, index) => {
    if (!mesh.isMesh) return;
    const group = sectionOf(index);
    mesh.material = whiteMaterial(group.step, index === 0);
    mesh.userData.assemblyStep = group.step;
    pieces.push({ mesh, index, group, original: mesh.position.clone(), rotation: mesh.quaternion.clone(), explosion: explosionOffset(index, group.step) });
  });
  eyes = new THREE.Group();
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe4aa, transparent: true });
  const faceProbe = new THREE.Mesh(source.children[0].geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const eyeRay = new THREE.Raycaster();
  for (const x of [-.075, .075]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(.021, .032, 5, 16), eyeMaterial);
    eyeRay.set(new THREE.Vector3(x, .007, 1), new THREE.Vector3(0, 0, -1));
    const surface = eyeRay.intersectObject(faceProbe, false)[0]?.point.z ?? .105;
    eye.position.set(x, .007, surface + .015);
    eye.scale.z = .2;
    eyes.add(eye);
  }
  source.children[0].add(eyes);
  heroModel = source.clone(true);
  heroModel.position.copy(model.position);
  heroModel.position.y += extent * .2;
  heroModel.traverse((child) => {
    if (!child.isMesh) return;
    child.material = child.material.clone();
    child.material.opacity = 1;
    child.material.transparent = false;
    child.material.depthWrite = true;
  });
  heroGloss = new THREE.Group();
  heroGloss.visible = false;
  for (const child of heroModel.children.slice(1)) {
    if (!child.isMesh) continue;
    const glossy = child.clone(false);
    glossy.material = plasticMaterial();
    glossy.material.userData.region = child.position.x < -.08 ? 0 : child.position.x > .08 ? 2 : 1;
    glossy.material.userData.spill = [3, 4, 5].includes(heroModel.children.indexOf(child)) ? .52 : .16;
    glossy.renderOrder = 3;
    glossMaterials.push(glossy.material);
    heroGloss.add(glossy);
  }
  heroModel.add(heroGloss);
  heroScene.add(heroModel);
  if (lowHeroModel) {
    heroScene.remove(lowHeroModel);
    lowHeroModel.traverse((part) => { if (part.isMesh) part.material.dispose(); });
    lowHeroModel = null;
  }
  film.face = heroModel.children[0];
  film.eyes = film.face.children.find((child) => child.isGroup);
  const faceGeometry = film.face.geometry;
  faceGeometry.computeBoundingBox();
  const box = faceGeometry.boundingBox;
  const faceWidth = Math.max(box.max.x - box.min.x, .01);
  const faceHeight = Math.max(box.max.y - box.min.y, .01);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(faceWidth, faceHeight), filmMaterial);
  screen.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + .008);
  screen.renderOrder = 2;
  film.face.renderOrder = 1;
  film.face.material.stencilWrite = true;
  film.face.material.stencilRef = 1;
  film.face.material.stencilFunc = THREE.AlwaysStencilFunc;
  film.face.material.stencilZPass = THREE.ReplaceStencilOp;
  film.face.add(screen);
  heroModel.updateMatrixWorld(true);
  const faceLocal = box.getCenter(new THREE.Vector3());
  film.face.localToWorld(faceLocal);
  heroModel.worldToLocal(faceLocal);
  film.faceLocal.copy(faceLocal);
  const faceScale = new THREE.Vector3();
  film.face.getWorldScale(faceScale);
  film.faceSize.set(faceWidth, faceHeight, Math.max(box.max.z - box.min.z, .01)).multiply(faceScale);
  film.material.uniforms.faceAspect.value = faceWidth / Math.max(faceHeight, 1e-4);
  film.faceForward.set(0, 0, 1).transformDirection(film.face.matrix);
  if (film.faceForward.lengthSq() < .25) film.faceForward.set(0, 0, 1);
  film.faceForward.normalize();
  heroHost.addEventListener('pointerdown', (event) => {
    if (film.stage || film.target) return;
    heroOrbit.pointer = event.pointerId;
    heroOrbit.moved = false;
    heroOrbit.x = event.clientX;
    heroOrbit.y = event.clientY;
    heroHost.setPointerCapture(event.pointerId);
  });
  heroHost.addEventListener('pointermove', (event) => {
    if (heroOrbit.pointer !== event.pointerId) return;
    if (Math.abs(event.clientX - heroOrbit.x) + Math.abs(event.clientY - heroOrbit.y) > 3) heroOrbit.moved = true;
    heroOrbit.yaw += (event.clientX - heroOrbit.x) * .008;
    heroOrbit.pitch = clamp(heroOrbit.pitch + (event.clientY - heroOrbit.y) * .005, -.45, .45);
    heroOrbit.x = event.clientX;
    heroOrbit.y = event.clientY;
  });
  const stopOrbit = (event) => {
    if (heroOrbit.pointer !== event.pointerId) return;
    heroOrbit.pointer = null;
    if (!heroOrbit.moved && event.type === 'pointerup' && film.pose < .02) {
      const rect = heroHost.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const hitTest = new THREE.Raycaster();
      hitTest.setFromCamera(pointer, heroCamera);
      if (hitTest.intersectObject(heroModel, true).length) setFilm(true);
    }
  };
  heroHost.addEventListener('pointerup', stopOrbit);
  heroHost.addEventListener('pointercancel', stopOrbit);
  heroHost.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && !film.target && film.pose < .02) { event.preventDefault(); setFilm(true); } });
  measure();
}, undefined, () => { status.textContent = window.crabooTranslate?.('三维模型载入失败') ?? '三维模型载入失败'; });

function measure() {
  if (document.body.dataset.page !== 'home') return;
  const viewport = innerHeight;
  let value = 0;
  chapters.forEach((chapter, index) => {
    const box = chapter.getBoundingClientRect();
    const centerY = box.top + box.height * 0.5;
    if (centerY < viewport * 0.55) value = index;
    else if (index > 0 && centerY < viewport * 1.45) value = Math.max(value, index - 1 + clamp((viewport * 1.45 - centerY) / (viewport * 0.9), 0, 1));
  });
  state.target = clamp(value, 0, 5);
  const active = clamp(Math.round(state.target), 0, 5);
  if (active !== state.step) { state.step = active; state.expandTarget = 0; state.expanded = 0; updateButtons(); }
  chapters.forEach((chapter, index) => chapter.classList.toggle('active', index === active));
  number.textContent = `${String(active).padStart(2, '0')} / 05`;
  progressBar.style.width = `${state.target * 20}%`;
  status.textContent = window.crabooTranslate?.(['整体印象', '足部装配', '主体装配', '收音部件', '表情反馈', '装配完成'][active]) ?? '';
}
function updateButtons() {
  document.querySelectorAll('.explode-toggle').forEach((button) => {
    const active = Number(button.closest('[data-assembly]').dataset.assembly) === state.step && state.expandTarget;
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.textContent = window.crabooTranslate?.(active ? '合上部件 ↙' : '查看爆炸结构 ↗') ?? '';
  });
}
function toggleExploded(step) {
  if (step !== state.step || !step) return;
  state.expandTarget = state.expandTarget ? 0 : 1;
  updateButtons();
}
document.querySelectorAll('.explode-toggle').forEach((button) => button.addEventListener('click', () => toggleExploded(Number(button.closest('[data-assembly]').dataset.assembly))));
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('click', (event) => {
  if (!model || !state.step) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pieces.filter((piece) => piece.group.step === state.step).map((piece) => piece.mesh), false)[0];
  if (hit) toggleExploded(state.step);
});
addEventListener('scroll', measure, { passive: true });
addEventListener('resize', measure);
addEventListener('craboo:page', measure);
addEventListener('craboo:language', () => { measure(); updateButtons(); labelStep = -1; });
measure();
new ResizeObserver(() => {
  const { width, height } = host.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}).observe(host);

const axis = new THREE.Vector3(0, 0.783, -0.622).normalize();
const twist = new THREE.Quaternion();
const guideTargets = [null, 19, 16, 2, 0, 4];
const pieceCenter = new THREE.Vector3();
const partLabels = {
  1: [[6, '转向'], [19, '抬落'], [64, '足端']],
  2: [[12, '下承托'], [16, '主体']],
  3: [[13, '左侧'], [17, '右侧']],
  4: [[0, '面板'], [1, '内衬']],
  5: [[3, '前壳'], [4, '中壳'], [5, '后壳']],
};
const labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
labelLayer.setAttribute('class', 'part-callouts');
guide.append(labelLayer);
let labelStep = -1;
function updateGuide() {
  const step = state.step;
  if (!step || host.clientWidth < 620) { guide.style.opacity = '0'; return; }
  const piece = pieces.find((item) => item.index === guideTargets[step]);
  const detail = chapters[step]?.querySelector('.assembly-detail');
  if (!piece || !detail) return;
  const bounds = host.getBoundingClientRect();
  piece.mesh.geometry.computeBoundingBox();
  piece.mesh.geometry.boundingBox.getCenter(pieceCenter).applyMatrix4(piece.mesh.matrixWorld).project(camera);
  const x = (pieceCenter.x * .5 + .5) * bounds.width;
  const y = (-pieceCenter.y * .5 + .5) * bounds.height;
  const text = detail.getBoundingClientRect();
  const tx = state.step % 2 ? text.right - bounds.left : text.left - bounds.left;
  const ty = text.top + 20 - bounds.top;
  guide.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  guidePath.setAttribute('d', `M ${x} ${y} L ${(x + tx) / 2} ${y} L ${(x + tx) / 2} ${ty} L ${tx} ${ty}`);
  guideDot.setAttribute('cx', String(x)); guideDot.setAttribute('cy', String(y));
  guide.style.opacity = '1';
  if (labelStep !== step) {
    labelStep = step;
    labelLayer.replaceChildren();
    for (const [, name] of partLabels[step] || []) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.innerHTML = `<path></path><circle r="3"></circle><text>${window.crabooTranslate?.(name) ?? name}</text>`;
      labelLayer.append(group);
    }
  }
  labelLayer.style.opacity = String(clamp((state.expanded - .15) * 1.5, 0, 1));
  (partLabels[step] || []).forEach(([index], i) => {
    const item = pieces.find((entry) => entry.index === index);
    if (!item) return;
    item.mesh.geometry.boundingBox.getCenter(pieceCenter).applyMatrix4(item.mesh.matrixWorld).project(camera);
    const px = (pieceCenter.x * .5 + .5) * bounds.width;
    const py = (-pieceCenter.y * .5 + .5) * bounds.height;
    const lx = clamp(px + (px < bounds.width / 2 ? -55 : 55), 38, bounds.width - 38);
    const ly = clamp(py - 26, 85, bounds.height - 50);
    const group = labelLayer.children[i];
    group.querySelector('path').setAttribute('d', `M ${px} ${py} L ${lx} ${ly}`);
    group.querySelector('circle').setAttribute('cx', String(px));
    group.querySelector('circle').setAttribute('cy', String(py));
    group.querySelector('text').setAttribute('x', String(lx));
    group.querySelector('text').setAttribute('y', String(ly - 5));
  });
}
function animate(now) {
  requestAnimationFrame(animate);
  if (document.body.dataset.page !== 'home' || document.hidden) return;
  state.progress += (state.target - state.progress) * 0.14;
  if (Math.abs(state.target - state.progress) < .002) state.progress = state.target;
  state.expanded += (state.expandTarget - state.expanded) * .12;
  if (Math.abs(state.expandTarget - state.expanded) < .002) state.expanded = state.expandTarget;
  const p = state.progress;
  if (model) {
    const faceArrival = ease(clamp(p - 3, 0, 1));
    eyes.visible = faceArrival > .04;
    eyes.children.forEach((eye) => { eye.material.opacity = faceArrival; });
    for (const piece of pieces) {
      const t = ease(clamp(p - piece.group.step + 1, 0, 1));
      const step = piece.group.step;
      piece.mesh.visible = t > .04;
      if (!piece.mesh.visible) continue;
      const focus = step === state.step;
      const explode = focus ? state.expanded : 0;
      const entry = step === 3 && piece.index === 13 ? new THREE.Vector3(-1.2, .1, 0) : piece.group.offset;
      piece.mesh.position.copy(piece.original).addScaledVector(entry, (1 - t) * extent);
      const explodeScale = [0, .8, .7, .48, .6, .58][step];
      piece.mesh.position.addScaledVector(piece.explosion, explode * extent * explodeScale);
      const opaque = t > .995;
      if (piece.mesh.material.transparent === opaque) { piece.mesh.material.transparent = !opaque; piece.mesh.material.needsUpdate = true; }
      piece.mesh.material.opacity = opaque ? 1 : t;
      piece.mesh.material.depthWrite = opaque;
      piece.mesh.quaternion.copy(piece.rotation);
      if (piece.index === 4 || piece.index === 5) {
        twist.setFromAxisAngle(axis, (p - 4) * .045 * t);
        piece.mesh.quaternion.multiply(twist);
      }
    }
    const yaw = [-.45, .45, -.45, .55, -.28, -.22];
    const i = Math.min(4, Math.floor(p));
    model.rotation.y = THREE.MathUtils.lerp(yaw[i], yaw[i + 1], ease(p - i));
    model.rotation.x = -0.04 + Math.sin(p * 0.65) * 0.075;
    const sides = host.clientWidth > 900 ? [.1, .42, -.42, .42, -.42, .42] : host.clientWidth > 620 ? [.1, .21, -.21, .21, -.21, .4] : [.1, 0, 0, 0, 0, 0];
    model.position.x = -center.x + THREE.MathUtils.lerp(sides[i], sides[i + 1], ease(p - i)) * extent;
    model.position.y = -center.y + Math.sin(p * 0.7) * extent * 0.02;
  }
  const distances = [3.7, 3.3, 3.8, 3.8, 3.1, 3.7];
  const at = Math.min(4, Math.floor(p));
  const expansionDistance = [0, .9, .9, 1.65, .8, 1.35][state.step];
  const mobileScale = host.clientWidth < 620 ? .74 : 1;
  const distance = THREE.MathUtils.lerp(distances[at], distances[at + 1], ease(p - at)) * mobileScale + state.expanded * expansionDistance;
  camera.position.set(extent * (.3 - .08 * ease(clamp(p - 4, 0, 1))), extent * .55, extent * distance);
  camera.lookAt(0, 0.05 * extent, 0);
  model?.updateMatrixWorld(true);
  if (assemblyVisible) { updateGuide(); renderer.render(scene, camera); }
  if (heroModel && (heroVisible || film.stage)) updateHeroFilm(now);
  else if (lowHeroModel && heroVisible) {
    lowHeroModel.rotation.set(heroOrbit.pitch, heroOrbit.yaw, 0);
    heroCamera.position.set(0, .48, 2.2);
    heroCamera.lookAt(0, .08, 0);
    heroRenderer.render(heroScene, heroCamera);
  }
}
const heroRestLook = new THREE.Vector3();
const heroRestPos = new THREE.Vector3();
const heroEndLook = new THREE.Vector3();
const heroEndPos = new THREE.Vector3();
const heroLook = new THREE.Vector3();
const heroPos = new THREE.Vector3();
const heroEuler = new THREE.Euler();
const heroQuat = new THREE.Quaternion();
const heroProjected = new THREE.Vector3();
function shortestAngle(from, to) {
  const tau = Math.PI * 2;
  return ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
}
function facePoint(pitch, yaw, target) {
  heroEuler.set(pitch, yaw, 0);
  heroQuat.setFromEuler(heroEuler);
  return target.copy(film.faceLocal).applyQuaternion(heroQuat).add(heroModel.position);
}
function faceCameraDistance() {
  const tan = Math.tan(THREE.MathUtils.degToRad(heroCamera.fov) * .5);
  const aspect = Math.max(heroCamera.aspect || 1, .4);
  const distH = (film.faceSize.y / .58) / (2 * tan);
  const distW = (film.faceSize.x / 1.05) / (2 * tan * aspect);
  return Math.max(Math.min(distH, distW), film.faceSize.z * 2, .05);
}
function updateHeroFilm(now) {
  const dt = film.lastTime ? Math.min((now - film.lastTime) / 1000, .05) : 0;
  film.lastTime = now;
  if (film.stage || film.target) {
    if (film.target) {
      film.pose = Math.min(1, film.pose + dt / poseSeconds());
      if (film.pose >= .995) {
        film.pose = 1;
        film.screen = Math.min(1, film.screen + dt / screenInSeconds());
      }
    } else {
      film.pose = Math.max(0, film.pose - dt / poseSeconds());
      film.screen = Math.max(0, film.screen - dt / screenOutSeconds());
      if (!film.video.paused) film.video.pause();
    }
    if (!film.target && film.pose <= .001 && film.screen <= .001) finishFilm();
  }
  const t = film.pose;
  const turn = ease(clamp(t / .74, 0, 1));
  const zoom = ease(clamp((t - .1) / .9, 0, 1));
  const dark = film.stage ? Math.max(ease(clamp(t / .9, 0, 1)), ease(film.screen)) : 0;
  const gloss = ease(clamp((t - .13) / .73, 0, 1));
  heroGloss.visible = gloss > .005;
  for (const material of glossMaterials) material.opacity = gloss;
  if (!film.stage) {
    heroModel.rotation.set(heroOrbit.pitch, heroOrbit.yaw, 0);
    heroCamera.position.set(0, extent * .48, extent * 2.2);
    heroCamera.lookAt(0, extent * .08, 0);
    heroHemi.intensity = 1.05;
    heroKey.intensity = 1.4;
    heroFill.intensity = 0;
    heroRenderer.toneMappingExposure = 1.45;
  } else {
    const yaw = film.yaw0 + shortestAngle(film.yaw0, 0) * turn;
    const pitch = film.pitch0 * (1 - turn);
    heroModel.rotation.set(pitch, yaw, 0);
    heroRestLook.set(0, extent * .08, 0);
    heroRestPos.set(0, extent * .48, extent * 2.2);
    heroPos.copy(heroRestPos).sub(heroRestLook).multiplyScalar(film.boost).add(heroRestLook);
    facePoint(0, 0, heroEndLook);
    heroEndPos.copy(heroEndLook).addScaledVector(film.faceForward, faceCameraDistance() + film.faceSize.z * .5 + .02);
    heroPos.lerp(heroEndPos, zoom);
    heroLook.copy(heroRestLook).lerp(heroEndLook, zoom);
    const pan = 1 - zoom;
    if (pan > 0 && (film.shiftX || film.shiftY)) {
      const viewHeight = 2 * heroPos.distanceTo(heroLook) * Math.tan(THREE.MathUtils.degToRad(heroCamera.fov) * .5);
      const worldPerPx = viewHeight / Math.max(heroHost.clientHeight, 1);
      const dx = -film.shiftX * worldPerPx * pan;
      const dy = film.shiftY * worldPerPx * pan;
      heroPos.x += dx;
      heroPos.y += dy;
      heroLook.x += dx;
      heroLook.y += dy;
    }
    heroCamera.position.copy(heroPos);
    heroCamera.lookAt(heroLook);
    heroHemi.intensity = 1.05 * (1 - dark * .42);
    heroKey.intensity = 1.4 * (1 - dark * .25);
    heroFill.intensity = dark * .75;
    heroRenderer.toneMappingExposure = 1.45 - dark * .22;
    facePoint(pitch, yaw, heroProjected);
    heroProjected.project(heroCamera);
    const bounds = film.intro.getBoundingClientRect();
    film.play.style.left = `${(heroProjected.x * .5 + .5) * bounds.width}px`;
    film.play.style.top = `${(-heroProjected.y * .5 + .5) * bounds.height}px`;
    heroScreenLights.forEach((light, index) => {
      light.position.copy(heroEndLook).addScaledVector(film.faceForward, .38);
      light.position.x += (index - 1) * .29;
      light.position.y += index === 1 ? .17 : -.06;
    });
  }
  if (film.playing && now - lastReflection > 250 && film.video.readyState >= 2) {
    lastReflection = now;
    reflectionContext.drawImage(film.video, 0, 0, 16, 9);
    const pixels = reflectionContext.getImageData(0, 0, 16, 9).data;
    heroScreenLights.forEach((light, region) => {
      let r = 0, g = 0, b = 0;
      for (let y = 0; y < 9; y++) for (let x = region * 5; x < region * 5 + 5; x++) {
        const i = (y * 16 + x) * 4;
        r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2];
      }
      reflectionTargets[region].setRGB(r / (45 * 255), g / (45 * 255), b / (45 * 255), THREE.SRGBColorSpace);
    });
  }
  heroScreenLights.forEach((light, region) => {
    light.color.lerp(reflectionTargets[region], 1 - Math.exp(-dt * 2.4));
    light.intensity += ((film.playing ? 7.5 * gloss : 0) - light.intensity) * Math.min(1, dt * 5);
  });
  glossMaterials.forEach((material) => {
    material.emissive.copy(heroScreenLights[material.userData.region].color);
    const target = film.playing ? material.userData.spill * gloss : 0;
    material.emissiveIntensity += (target - material.emissiveIntensity) * Math.min(1, dt * 4);
  });
  const eyeOpacity = film.stage ? 1 - Math.max(ease(clamp((t - .36) / .52, 0, 1)), ease(film.screen)) : 1;
  if (film.eyes) {
    film.eyes.visible = eyeOpacity > .03;
    film.eyes.children.forEach((eye) => {
      eye.material.transparent = eyeOpacity < .98;
      eye.material.opacity = eyeOpacity;
      eye.material.depthWrite = eyeOpacity > .9;
    });
  }
  const solidTarget = film.playing ? 1 : 0;
  film.solid += (solidTarget - film.solid) * (1 - Math.exp(-dt * 4.5));
  film.material.uniforms.reveal.value = film.screen;
  film.material.uniforms.solid.value = film.solid;
  film.material.uniforms.videoAspect.value = film.videoAspect;
  const exitAlpha = film.stage ? Math.max(ease(clamp(t / .28, 0, 1)), ease(film.screen)) : 0;
  const playTarget = film.target && film.pose >= 1 && !film.playing ? ease(film.screen) : 0;
  film.playAlpha += (playTarget - film.playAlpha) * (1 - Math.exp(-dt * 7));
  document.documentElement.style.setProperty('--exit-opacity', exitAlpha.toFixed(3));
  film.exit.style.pointerEvents = exitAlpha > .35 ? 'auto' : 'none';
  film.intro.style.setProperty('--play-opacity', Math.max(0, film.playAlpha).toFixed(3));
  film.intro.classList.toggle('film-play-ready', film.playAlpha > .4);
  document.documentElement.style.setProperty('--film-dark', dark.toFixed(3));
  const header = document.querySelector('header');
  if (header) header.style.pointerEvents = dark > .62 ? 'none' : '';
  heroRenderer.render(heroScene, heroCamera);
}
requestAnimationFrame(animate);
