import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const AXIS = new THREE.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
const AXIS_INV = AXIS.clone().invert();
const world = new THREE.Matrix4();
const rotation = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

function meshGeometry(model, id, planarUV = false) {
  const vertices = [], uv = [];
  const faceStart = model.mesh_faceadr[id];
  const vertexStart = model.mesh_vertadr[id];
  const textureStart = model.mesh_texcoordadr[id];
  const hasUV = model.mesh_texcoordnum[id] > 0;
  for (let face = 0; face < model.mesh_facenum[id]; face++) {
    for (let corner = 0; corner < 3; corner++) {
      const slot = (faceStart + face) * 3 + corner;
      const vertex = (vertexStart + model.mesh_face[slot]) * 3;
      vertices.push(model.mesh_vert[vertex], model.mesh_vert[vertex + 2], -model.mesh_vert[vertex + 1]);
      if (hasUV) {
        const texIndex = model.mesh_facetexcoord[slot];
        const tex = (textureStart + Math.max(0, texIndex)) * 2;
        uv.push(model.mesh_texcoord[tex], model.mesh_texcoord[tex + 1]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (hasUV) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  else if (planarUV) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const mapped = [];
    for (let i = 0; i < vertices.length; i += 3) {
      mapped.push((vertices[i] - min.x) / Math.max(1e-6, max.x - min.x), (vertices[i + 1] - min.y) / Math.max(1e-6, max.y - min.y));
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mapped, 2));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function primitive(model, id) {
  const type = model.geom_type[id];
  const size = model.geom_size;
  const x = size[id * 3], y = size[id * 3 + 1], z = size[id * 3 + 2];
  if (type === 7) return meshGeometry(model, model.geom_dataid[id], model.geom(id).name === 'source_face_screen_visual');
  if (type === 6) return new THREE.BoxGeometry(x * 2, z * 2, y * 2);
  if (type === 5) return new THREE.CylinderGeometry(x, x, y * 2, 20);
  if (type === 3) return new THREE.CapsuleGeometry(x, y * 2, 6, 12);
  if (type === 2) return new THREE.SphereGeometry(x, 18, 12);
  if (type === 4) return new THREE.SphereGeometry(1, 18, 12).scale(x, z, y);
  if (type === 0) return new THREE.PlaneGeometry(Math.max(x * 2, 8), Math.max(y * 2, 8)).rotateX(-Math.PI / 2);
  return null;
}

function material(model, id, textures) {
  const rgba = Array.from(model.geom_rgba).slice(id * 4, id * 4 + 4);
  const matId = model.geom_matid[id];
  const matName = matId >= 0 ? model.mat(matId).name : '';
  const source = textures.materials.get(matName);
  const materialColor = matId >= 0 ? Array.from(model.mat_rgba).slice(matId * 4, matId * 4 + 4) : [1,1,1,1];
  const color = rgba[0] === 1 && rgba[1] === 1 && rgba[2] === 1 ? materialColor : rgba;
  const alpha = rgba[3] * materialColor[3];
  const output = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color[0], color[1], color[2]),
    roughness: source?.getAttribute('roughness') ? Number(source.getAttribute('roughness')) : matName.includes('metal') ? 0.3 : 0.75,
    metalness: source?.getAttribute('metallic') ? Number(source.getAttribute('metallic')) : matName.includes('metal') ? 0.72 : 0.05,
    transparent: alpha < 0.99,
    opacity: alpha,
    side: THREE.DoubleSide,
  });
  const textureName = source?.getAttribute('texture');
  if (textureName && textures.textures.has(textureName)) {
    const path = textures.textures.get(textureName);
    const map = new THREE.TextureLoader().load(`assets/sim/bedroom/${path}`);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    output.map = map;
  }
  return output;
}

export function createMujocoView(host, model, xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const textures = {
    materials: new Map([...doc.querySelectorAll('material[name]')].map((item) => [item.getAttribute('name'), item])),
    textures: new Map([...doc.querySelectorAll('texture[name][file]')].map((item) => [item.getAttribute('name'), item.getAttribute('file')])),
  };
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0xe8ded0);
  renderer.shadowMap.enabled = true;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8ded0);
  scene.add(new THREE.HemisphereLight(0xfff5e4, 0x777275, 2.1));
  const sun = new THREE.DirectionalLight(0xffead2, 3);
  sun.position.set(-2, 5, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 50);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.minDistance = 0.12;
  orbit.maxDistance = 12;
  const views = {
    robot() { currentView = 'robot'; orbit.target.set(-0.08,0.81,-1.84); camera.position.set(0.14,0.95,-1.55); orbit.update(); },
    desk() { currentView = 'desk'; orbit.target.set(0.35,0.76,-1.67); camera.position.set(1.1,1.2,-0.95); orbit.update(); },
    room() { currentView = 'room'; orbit.target.set(0,0.6,0); camera.position.set(3,2.4,3); orbit.update(); },
  };
  let currentView = 'robot';
  const lastBase = new THREE.Vector3(-0.08, 0.754, -1.84);
  views.robot();
  const items = [];
  const pickable = [];
  let face;
  const faceEyes = [];
  for (let id = 0; id < model.ngeom; id++) {
    const rgba = model.geom_rgba;
    if (rgba[id * 4 + 3] < 0.01) continue;
    const geometry = primitive(model, id);
    if (!geometry) continue;
    const object = new THREE.Mesh(geometry, material(model, id, textures));
    const name = model.geom(id).name;
    object.userData = { geomId: id, name, bodyId: model.geom_bodyid[id] };
    object.castShadow = model.geom_group[id] === 1;
    object.receiveShadow = true;
    scene.add(object);
    items.push({ id, object });
    if (model.geom_bodyid[id] === 1 || name.includes('shell')) pickable.push(object);
    if (name === 'source_face_screen_visual') {
      face = object;
      for (const x of [-.072, .072]) {
        const eye = new THREE.Mesh(new THREE.CapsuleGeometry(.024, .04, 4, 12), new THREE.MeshBasicMaterial({ color: 0xffe3aa }));
        eye.position.set(x, .55, .16);
        eye.scale.set(1, 1, .28);
        face.add(eye);
        faceEyes.push(eye);
      }
    }
  }
  const faceTextures = {};
  for (const expression of ['idle','moving','tapping','surprised','blink']) {
    const path = textures.textures.get(`face_${expression}_texture`);
    if (path) {
      faceTextures[expression] = new THREE.TextureLoader().load(`assets/sim/bedroom/${path}`);
      faceTextures[expression].colorSpace = THREE.SRGBColorSpace;
    }
  }
  function expression(name) {
    if (face && faceTextures[name]) {
      face.material.map = faceTextures[name];
      face.material.needsUpdate = true;
    }
    faceEyes.forEach((eye) => { eye.scale.y = name === 'blink' ? .08 : name === 'surprised' ? 1.35 : 1; });
  }
  function update(data) {
    const base = new THREE.Vector3(data.xpos[3], data.xpos[5], -data.xpos[4]);
    if (currentView === 'robot') {
      const movement = base.clone().sub(lastBase);
      camera.position.add(movement);
      orbit.target.add(movement);
    }
    lastBase.copy(base);
    for (const { id, object } of items) {
      const p = id * 3, r = id * 9;
      position.set(data.geom_xpos[p], data.geom_xpos[p + 2], -data.geom_xpos[p + 1]);
      rotation.set(data.geom_xmat[r],data.geom_xmat[r+1],data.geom_xmat[r+2],0,
        data.geom_xmat[r+3],data.geom_xmat[r+4],data.geom_xmat[r+5],0,
        data.geom_xmat[r+6],data.geom_xmat[r+7],data.geom_xmat[r+8],0,0,0,0,1);
      world.copy(AXIS).multiply(rotation).multiply(AXIS_INV);
      world.decompose(new THREE.Vector3(), quaternion, scale);
      object.position.copy(position);
      object.quaternion.copy(quaternion);
    }
    orbit.update();
    renderer.render(scene, camera);
  }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  return { update, views, renderer, camera, scene, pickable, expression, orbit };
}
