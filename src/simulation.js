import * as THREE from 'three';
import loadMujoco from '@mujoco/mujoco';
import { createMujocoView } from './mujoco-renderer.js';
import { gaitTargets } from './locomotion.js';

const $ = (id) => document.getElementById(id);
const host = $('sim-canvas');
const status = $('sim-status');
const toggle = $('sim-toggle');
const reset = $('sim-reset');
const autoButton = $('sim-auto');
const manualButton = $('sim-manual');
const keys = new Set();
let driveMode = 'manual';
const inputKeys = new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
window.addEventListener('keydown', (event) => {
  if (document.body.dataset.page !== 'simulation' || driveMode !== 'manual' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  const key = event.key.toLowerCase();
  if (inputKeys.has(key)) { keys.add(key); event.preventDefault(); }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
autoButton.addEventListener('click', () => { driveMode = 'auto'; keys.clear(); autoButton.classList.add('selected'); manualButton.classList.remove('selected'); status.textContent = '自动寻找：使用仿真场景物体坐标导航（模拟感知）'; });
manualButton.addEventListener('click', () => { driveMode = 'manual'; autoButton.classList.remove('selected'); manualButton.classList.add('selected'); status.textContent = '手动控制：按住 W/S 前后，A/D 转向'; });

async function loadScene(mj) {
  const response = await fetch('assets/sim/bedroom/scene.xml');
  if (!response.ok) throw Error('桌面场景缺失');
  const xml = await response.text();
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw Error('桌面场景 XML 无法解析');
  mj.FS.mkdir('/craboo');
  mj.FS.mkdir('/craboo/files');
  const files = [...new Set([...documentXml.querySelectorAll('[file]')].map((node) => node.getAttribute('file')))];
  await Promise.all(files.map(async (file) => {
    const source = await fetch(`assets/sim/bedroom/${file}`);
    if (!source.ok) throw Error(`缺少场景资源：${file}`);
    mj.FS.writeFile(`/craboo/${file}`, new Uint8Array(await source.arrayBuffer()));
  }));
  mj.FS.writeFile('/craboo/scene.xml', xml);
  const model = mj.MjModel.mj_loadXML('/craboo/scene.xml');
  if (!model) throw Error('MuJoCo 模型加载失败');
  const data = new mj.MjData(model);
  mj.mj_forward(model, data);
  return { xml, model, data };
}

function touchTone() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(410, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(270, context.currentTime + 0.2);
  gain.gain.setValueAtTime(0.06, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
  oscillator.onended = () => context.close();
}

try {
  const mj = await loadMujoco();
  const { xml, model, data } = await loadScene(mj);
  const [walkProfile, turnProfile] = await Promise.all(['walk','turn'].map(async (name) => {
    const response = await fetch(`assets/sim/bedroom/gait_${name}_lifted.json`);
    if (!response.ok) throw Error(`步态参数缺失：${name}`);
    return (await response.json()).parameters;
  }));
  const view = createMujocoView(host, model, xml);
  const base = model.body('base_link').id;
  const shell = { top: 0, second: 0 };
  const shellJoint = {
    top: model.jnt_qposadr[model.jnt('shell_top_joint').id],
    second: model.jnt_qposadr[model.jnt('shell_second_joint').id],
  };
  let running = false;
  let previous = performance.now();
  let accumulator = 0;
  let ambientLevel = 0;
  let wasTipped = false;
  let drag = null;
  let lastStatus = 0;
  status.textContent = 'MuJoCo 桌面场景已就绪 · Ctrl 拖动机器人可施加扰动';

  toggle.addEventListener('click', () => {
    running = !running;
    toggle.textContent = running ? '暂停仿真' : '启动仿真';
  });
  reset.addEventListener('click', () => {
    mj.mj_resetData(model, data);
    mj.mj_forward(model, data);
    keys.clear();
    shell.top = shell.second = 0;
    accumulator = 0;
    view.expression('idle');
    status.textContent = 'MuJoCo 已重置';
  });
  for (const button of document.querySelectorAll('[data-sim-view]')) {
    button.addEventListener('click', () => view.views[button.dataset.simView]());
  }
  window.addEventListener('craboo:shell', ({ detail }) => {
    shell[detail.index === 0 ? 'top' : 'second'] = detail.speed === 0 ? 0 : detail.speed === 1 ? 1.5 : 4;
  });
  window.addEventListener('craboo:ambient', ({ detail }) => {
    ambientLevel = detail.level;
    view.expression(ambientLevel > 30 ? 'surprised' : ambientLevel > 7 ? 'moving' : 'idle');
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function hit(event) {
    const bounds = view.renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, view.camera);
    return raycaster.intersectObjects(view.pickable, false)[0]?.object;
  }
  view.renderer.domElement.addEventListener('pointerdown', (event) => {
    const object = hit(event);
    if (!object) return;
    const bodyName = model.body(object.userData.bodyId).name;
    if (event.ctrlKey || event.metaKey) {
      drag = { kind: 'perturb', x: event.clientX, y: event.clientY };
      view.orbit.enabled = false;
      status.textContent = '正在施加 MuJoCo 外力扰动';
    } else if (bodyName.startsWith('shell_')) {
      drag = { kind: bodyName.includes('top') ? 'top' : 'second', x: event.clientX };
      view.orbit.enabled = false;
      status.textContent = '正在旋转上壳关节';
    } else {
      view.expression('blink');
      touchTone();
      status.textContent = '触碰已感知 · 它回应了你';
      setTimeout(() => view.expression(ambientLevel > 30 ? 'surprised' : 'idle'), 500);
      return;
    }
    view.renderer.domElement.setPointerCapture(event.pointerId);
  });
  view.renderer.domElement.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (drag.kind === 'perturb') {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      data.xfrc_applied[base * 6] = Math.max(-0.5, Math.min(0.5, dx * 0.006));
      data.xfrc_applied[base * 6 + 1] = Math.max(-0.5, Math.min(0.5, -dy * 0.006));
      data.xfrc_applied[base * 6 + 3] = Math.max(-0.02, Math.min(0.02, -dy * 0.00025));
      data.xfrc_applied[base * 6 + 4] = Math.max(-0.02, Math.min(0.02, dx * 0.00025));
      drag.x = event.clientX;
      drag.y = event.clientY;
    } else {
      const key = drag.kind;
      const delta = event.clientX - drag.x;
      data.qpos[shellJoint[key]] += delta * 0.012;
      mj.mj_forward(model, data);
      drag.x = event.clientX;
    }
  });
  function release() {
    if (!drag) return;
    data.xfrc_applied[base * 6] = 0;
    data.xfrc_applied[base * 6 + 1] = 0;
    data.xfrc_applied[base * 6 + 3] = 0;
    data.xfrc_applied[base * 6 + 4] = 0;
    drag = null;
    view.orbit.enabled = true;
  }
  view.renderer.domElement.addEventListener('pointerup', release);
  view.renderer.domElement.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  const targetsToVisit = ['bedroom_ball', 'bedroom_book', 'bedroom_cup'].map((name) => ({ name, id: model.body(name).id }));
  let autoIndex = 0;
  function commands() {
    if (driveMode === 'manual') return {
      drive: (Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))) * .015,
      steer: (Number(keys.has('a') || keys.has('arrowleft')) - Number(keys.has('d') || keys.has('arrowright'))) * Math.PI / 6,
    };
    const target = targetsToVisit[autoIndex];
    const x = data.xpos[base * 3], y = data.xpos[base * 3 + 1];
    const dx = data.xpos[target.id * 3] - x, dy = data.xpos[target.id * 3 + 1] - y;
    const distance = Math.hypot(dx, dy);
    if (distance < .35) autoIndex = (autoIndex + 1) % targetsToVisit.length;
    const desired = Math.atan2(dy, dx);
    const heading = 2 * Math.atan2(data.qpos[6], data.qpos[3]);
    const delta = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
    return { drive: Math.abs(delta) < .65 ? .015 : 0, steer: Math.max(-1, Math.min(1, delta * 1.8)) * Math.PI / 6, target: target.name };
  }
  function controls() {
    const { drive, steer } = commands();
    const targets = gaitTargets(data.time, drive, drive ? 0 : steer, walkProfile, turnProfile, drive ? steer : 0);
    for (let i = 0; i < 18; i++) data.ctrl[i] = targets[i];
    data.ctrl[24] = shell.top;
    data.ctrl[25] = shell.second;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (running && !document.hidden) {
      accumulator += elapsed;
      let steps = 0;
      try {
        while (accumulator >= model.opt.timestep && steps < 25) {
          controls();
          mj.mj_step(model, data);
          accumulator -= model.opt.timestep;
          steps++;
        }
      } catch (error) {
        running = false;
        toggle.textContent = '启动仿真';
        status.textContent = `MuJoCo 步进失败：${error.message}`;
        console.error(error);
      }
      if (steps === 25) accumulator = 0;
      if (now - lastStatus > 200) {
        const tipped = data.xmat[base * 9 + 8] < 0.65;
        if (tipped && !wasTipped) {
          view.expression('surprised');
          touchTone();
        }
        wasTipped = tipped;
        const distance = Math.hypot(data.qpos[0] - model.qpos0[0], data.qpos[1] - model.qpos0[1]);
        const heading = 2 * Math.atan2(data.qpos[6], data.qpos[3]) * 180 / Math.PI;
        if (running) status.textContent = `${tipped ? '它被推倒了 · ' : ''}${driveMode === 'auto' ? '自动寻找 ' + targetsToVisit[autoIndex].name.replace('bedroom_', '') + ' · ' : 'WASD 手动 · '}位移 ${(distance * 100).toFixed(1)} 厘米 · 朝向 ${heading.toFixed(0)}° · 声音 ${ambientLevel}%`;
        lastStatus = now;
      }
    }
    view.update(data);
  }
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  status.textContent = `MuJoCo 启动失败：${error.message}`;
  toggle.disabled = true;
}
