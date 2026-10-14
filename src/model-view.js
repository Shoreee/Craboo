import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.getElementById('model-canvas');
const status = document.getElementById('model-status');
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x827d78, 2.2));
  const key = new THREE.DirectionalLight(0xffe6c9, 3.5);
  key.position.set(3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9dce2, 2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.15;
  controls.maxDistance = 8;
  new GLTFLoader().load('assets/craboo.glb', ({ scene: model }) => {
    scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z);
    controls.target.copy(center);
    camera.position.set(center.x + radius * 1.5, center.y + radius * 0.9, center.z + radius * 1.8);
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    controls.update();
    status.textContent = '模型已载入 · 可拖动查看';
  }, undefined, () => { status.textContent = '模型载入失败，请刷新页面重试'; });
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(host);
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
  }
  frame();
} catch {
  status.textContent = '当前浏览器无法显示 3D，仍可观看下方仿真视频';
}
