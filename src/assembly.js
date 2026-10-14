import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const host = document.getElementById('assembly-canvas');
const heroHost = document.getElementById('hero-canvas');
const chapters = [...document.querySelectorAll('.assembly-chapter')];
const status = document.getElementById('assembly-status');
const number = document.getElementById('assembly-number');
const progressBar = document.querySelector('#assembly-progress i');
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
renderer.toneMappingExposure = 0.76;
host.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight(0xfff9f0, 0x967c69, .75));
const key = new THREE.DirectionalLight(0xfffbf3, 1.35);
key.position.set(3, 5, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd7b7, 0.8);
rim.position.set(-4, 1, -3);
scene.add(rim);

let model, pieces = [], center = new THREE.Vector3(), extent = 1;
let heroRenderer, heroScene, heroCamera, heroModel, eyes, liner;
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
  if (face) return new THREE.MeshStandardMaterial({ color: 0x211916, roughness: 1, metalness: 0, transparent: true, side: THREE.FrontSide });
  const shades = [0, 0xe8e1d7, 0xeee8df, 0xf1ebe3, 0xf6f0e8, 0xf4eee5];
  return new THREE.MeshToonMaterial({ color: shades[step], transparent: true, side: THREE.FrontSide, depthWrite: true });
}

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
  liner = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshToonMaterial({ color: 0xeee8df, transparent: true, side: THREE.FrontSide }));
  liner.scale.set(.45, .27, .04);
  liner.position.set(0, .59, -.04);
  source.add(liner);
  eyes = new THREE.Group();
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe4aa, transparent: true });
  for (const x of [-.025, .125]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .045, 5, 16), eyeMaterial);
    eye.position.set(x, .007, .218);
    eye.scale.z = .35;
    eyes.add(eye);
  }
  source.children[0].add(eyes);
  heroRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  heroRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  heroRenderer.outputColorSpace = THREE.SRGBColorSpace;
  heroRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  heroHost.append(heroRenderer.domElement);
  heroScene = new THREE.Scene();
  heroScene.add(new THREE.HemisphereLight(0xfff9f0, 0xa29488, 1.0));
  const heroKey = new THREE.DirectionalLight(0xfffbf3, 1.65);
  heroKey.position.set(3, 5, 5);
  heroScene.add(heroKey);
  heroModel = source.clone(true);
  heroModel.position.copy(model.position);
  heroModel.traverse((child) => { if (child.isMesh) { child.material = child.material.clone(); child.material.opacity = 1; child.material.transparent = false; child.material.depthWrite = true; } });
  heroScene.add(heroModel);
  heroCamera = new THREE.PerspectiveCamera(32, 1, .01, 100);
  const heroSize = () => { const { width, height } = heroHost.getBoundingClientRect(); if (!width || !height) return; heroRenderer.setSize(width, height, false); heroCamera.aspect = width / height; heroCamera.updateProjectionMatrix(); };
  new ResizeObserver(heroSize).observe(heroHost);
  heroSize();
  measure();
}, undefined, () => { status.textContent = '三维模型载入失败'; });

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
  status.textContent = ['整体印象', '足部装配', '主体装配', '收音部件', '表情反馈', '装配完成'][active];
}
function updateButtons() {
  document.querySelectorAll('.explode-toggle').forEach((button) => {
    const active = Number(button.closest('[data-assembly]').dataset.assembly) === state.step && state.expandTarget;
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.textContent = active ? '合上部件 ↙' : '查看爆炸结构 ↗';
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
      group.innerHTML = `<path></path><circle r="3"></circle><text>${name}</text>`;
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
    const linerArrival = ease(clamp(p - 4, 0, 1));
    const linerOpacity = linerArrival * (1 - state.expanded);
    liner.visible = linerOpacity > .04;
    liner.material.opacity = linerOpacity;
    liner.material.depthWrite = linerOpacity > .995;
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
  const distances = [3.7, 3.3, 3.8, 3.8, 3.8, 3.7];
  const at = Math.min(4, Math.floor(p));
  const expansionDistance = [0, .9, .9, 1.65, .8, 1.35][state.step];
  const mobileScale = host.clientWidth < 620 ? .74 : 1;
  const distance = THREE.MathUtils.lerp(distances[at], distances[at + 1], ease(p - at)) * mobileScale + state.expanded * expansionDistance;
  camera.position.set(extent * (.3 - .08 * ease(clamp(p - 4, 0, 1))), extent * .55, extent * distance);
  camera.lookAt(0, 0.05 * extent, 0);
  model?.updateMatrixWorld(true);
  updateGuide();
  renderer.render(scene, camera);
  if (heroModel) {
    heroModel.rotation.y = -.22;
    heroCamera.position.set(extent * .22, extent * .6, extent * 2.9);
    heroCamera.lookAt(0, 0.08 * extent, 0);
    heroRenderer.render(heroScene, heroCamera);
  }
}
requestAnimationFrame(animate);
