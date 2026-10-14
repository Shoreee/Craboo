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
renderer.toneMappingExposure = 0.88;
host.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight(0xfff9f0, 0xa29488, 1.0));
const key = new THREE.DirectionalLight(0xfffbf3, 1.65);
key.position.set(3, 5, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd7b7, 0.8);
rim.position.set(-4, 1, -3);
scene.add(rim);

let model, pieces = [], center = new THREE.Vector3(), extent = 1;
let heroRenderer, heroScene, heroCamera, heroModel, eyes;
const sections = [
  { indices: new Set([...Array.from({ length: 6 }, (_, i) => i + 6), 14, 15, ...Array.from({ length: 48 }, (_, i) => i + 18)]), step: 1, offset: new THREE.Vector3(0, -0.32, 0) },
  { indices: new Set([12, 16]), step: 2, offset: new THREE.Vector3(0, 0.38, 0) },
  { indices: new Set([2, 13, 17, 66]), step: 3, offset: new THREE.Vector3(0.5, 0.1, 0.15) },
  { indices: new Set([0, 1]), step: 4, offset: new THREE.Vector3(0, 0.12, 0.45) },
  { indices: new Set([3, 4, 5]), step: 5, offset: new THREE.Vector3(0, 0.72, -0.04) },
];
function sectionOf(index) {
  return sections.find((group) => group.indices?.has(index) || (index >= group.from && index <= group.to)) || sections[1];
}
function whiteMaterial(original, face) {
  if (face) return new THREE.MeshStandardMaterial({ color: 0x30241f, roughness: 0.75, metalness: 0, transparent: true });
  return new THREE.MeshToonMaterial({ color: 0xf2ece3, transparent: true, side: THREE.DoubleSide, depthWrite: true });
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
    mesh.material = whiteMaterial(mesh.material, index === 0);
    const outline = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x765f4f, side: THREE.BackSide, transparent: true, opacity: .7, depthWrite: false }));
    outline.userData.outline = true;
    outline.scale.setScalar(1.035);
    mesh.add(outline);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 42), new THREE.LineBasicMaterial({ color: 0x806454, transparent: true, opacity: .55, depthWrite: false }));
    mesh.add(edge);
    mesh.userData.assemblyStep = group.step;
    pieces.push({ mesh, edge, outline, index, group, original: mesh.position.clone(), rotation: mesh.quaternion.clone() });
  });
  eyes = new THREE.Group();
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe4aa });
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
  heroModel.traverse((child) => { if (child.isMesh || child.isLineSegments) { child.material = child.material.clone(); child.material.opacity = child.isLineSegments ? .55 : child.userData.outline ? .7 : 1; child.material.transparent = child.isLineSegments || Boolean(child.userData.outline); } });
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
  if (active !== state.step) { state.step = active; state.expandTarget = 0; updateButtons(); }
  chapters.forEach((chapter, index) => chapter.classList.toggle('active', index === active));
  number.textContent = `${String(active).padStart(2, '0')} / 05`;
  progressBar.style.width = `${state.target * 20}%`;
  status.textContent = ['整体印象', '足部装配', '主体装配', '收音部件', '表情反馈', '装配完成'][active];
}
function updateButtons() {
  document.querySelectorAll('.explode-toggle').forEach((button) => {
    const active = Number(button.closest('[data-assembly]').dataset.assembly) === state.step && state.expandTarget;
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.textContent = active ? '合上部件 ↙' : '点击模型或这里，展开部件 ↗';
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
}
function animate(now) {
  requestAnimationFrame(animate);
  if (document.body.dataset.page !== 'home' || document.hidden) return;
  state.progress += (state.target - state.progress) * 0.075;
  state.expanded += (state.expandTarget - state.expanded) * .12;
  const p = state.progress;
  if (model) {
    eyes.visible = state.step >= 4;
    for (const piece of pieces) {
      const t = ease(clamp(p - piece.group.step + 1, 0, 1));
      const step = piece.group.step;
      const visible = state.step === 5 || step === state.step;
      piece.mesh.visible = visible;
      if (!visible) continue;
      const focus = step === state.step;
      const explode = focus ? state.expanded : 0;
      const direction = new THREE.Vector3(Math.sin(piece.index * 2.7), Math.cos(piece.index * 1.9), Math.sin(piece.index * 1.3)).normalize();
      const finalJoin = state.step === 5 ? ease(clamp((p - 4.05) / .95, 0, 1)) : t;
      piece.mesh.position.copy(piece.original).addScaledVector(piece.group.offset, (1 - finalJoin) * extent);
      piece.mesh.position.addScaledVector(direction, explode * extent * .05);
      piece.mesh.material.opacity = state.step === 5 ? Math.max(.01, finalJoin) : Math.max(.01, t);
      piece.mesh.material.depthWrite = piece.mesh.material.opacity > .5;
      piece.edge.material.opacity = piece.mesh.material.opacity * .6;
      piece.outline.material.opacity = piece.mesh.material.opacity * .7;
      piece.mesh.quaternion.copy(piece.rotation);
      if (piece.index === 4 || piece.index === 5) {
        twist.setFromAxisAngle(axis, Math.sin(now * 0.0008 + piece.index) * 0.09 * t);
        piece.mesh.quaternion.multiply(twist);
      }
    }
    const yaw = [-.45, .45, -.45, .55, -.28, -.35];
    const i = Math.min(4, Math.floor(p));
    model.rotation.y = THREE.MathUtils.lerp(yaw[i], yaw[i + 1], ease(p - i)) + Math.sin(now * .00035) * .025;
    model.rotation.x = -0.04 + Math.sin(p * 0.65) * 0.075;
    const sides = host.clientWidth > 900 ? [.1, .5, -.5, .5, -.5, .5] : host.clientWidth > 620 ? [.1, .15, -.15, .15, -.15, .15] : [.1, .1, -.1, .1, -.1, .1];
    model.position.x = -center.x + THREE.MathUtils.lerp(sides[i], sides[i + 1], ease(p - i)) * extent;
    model.position.y = -center.y + Math.sin(p * 0.7) * extent * 0.02;
  }
  const distances = [2.8, 2.7, 2.9, 3.1, 2.05, 2.8];
  const at = Math.min(4, Math.floor(p));
  const distance = THREE.MathUtils.lerp(distances[at], distances[at + 1], ease(p - at));
  camera.position.set(extent * .3, extent * .55, extent * distance);
  camera.lookAt(0, 0.05 * extent, 0);
  model?.updateMatrixWorld(true);
  updateGuide();
  renderer.render(scene, camera);
  if (heroModel) {
    heroModel.rotation.y = -.04 + Math.sin(now * .00028) * .055;
    heroCamera.position.set(extent * .3, extent * .68, extent * 3.15);
    heroCamera.lookAt(0, 0.08 * extent, 0);
    heroRenderer.render(heroScene, heroCamera);
  }
}
requestAnimationFrame(animate);
