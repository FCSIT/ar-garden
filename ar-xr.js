import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let controller;
let reticle;
let currentModelUrl = 'rose.glb';
let loadedModels = {};
let placedModels = [];
let deleteMode = false;

// UI 按钮
const arBtn = document.getElementById('arBtn');
const roseBtn = document.getElementById('roseBtn');
const tulipBtn = document.getElementById('tulipBtn');
const undoBtn = document.getElementById('undoBtn');
const deleteBtn = document.getElementById('deleteBtn');
const arUIBtns = [roseBtn, tulipBtn, undoBtn, deleteBtn];

// 初始只显示 Start AR
arUIBtns.forEach(btn => btn.style.display = 'none');

arBtn.onclick = () => {
  // 初始化 AR 场景
  initAR();
  arBtn.style.display = 'none';
  arUIBtns.forEach(btn => btn.style.display = 'inline-block');
};

function initAR() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // AR Button（隐藏原生按钮）
  const arNativeBtn = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  arNativeBtn.style.display = 'none';
  document.body.appendChild(arNativeBtn);

  // 光照
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // UI 事件
  setupUI();

  // 监听 AR session 结束，隐藏按钮，显示 Start AR
  renderer.xr.addEventListener('sessionend', () => {
    arUIBtns.forEach(btn => btn.style.display = 'none');
    arBtn.style.display = 'inline-block';
    // 清理 Three.js 渲染器
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  });

  // Animation loop
  renderer.setAnimationLoop(render);

  // Hit test source
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  function render(timestamp, frame) {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();
      if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer').then(function (refSpace) {
          session.requestHitTestSource({ space: refSpace }).then(function (source) {
            hitTestSource = source;
          });
        });
        hitTestSourceRequested = true;
      }
      if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
    }
    renderer.render(scene, camera);
  }
}

function setupUI() {
  roseBtn.onclick = () => { currentModelUrl = 'rose.glb'; };
  tulipBtn.onclick = () => { currentModelUrl = 'tulip.glb'; };
  undoBtn.onclick = () => {
    const last = placedModels.pop();
    if (last) scene.remove(last);
  };
  deleteBtn.onclick = () => {
    deleteMode = !deleteMode;
    deleteBtn.textContent = deleteMode ? 'Click to Delete' : 'Delete';
    deleteBtn.classList.toggle('delete-mode', deleteMode);
  };
}

function onSelect() {
  if (!reticle.visible) return;
  if (deleteMode) {
    // 删除模式下，射线检测模型
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const intersects = raycaster.intersectObjects(placedModels, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !placedModels.includes(obj)) {
        obj = obj.parent;
      }
      scene.remove(obj);
      placedModels = placedModels.filter(m => m !== obj);
      // 退出删除模式
      deleteMode = false;
      deleteBtn.textContent = 'Delete';
      deleteBtn.classList.remove('delete-mode');
    }
    return;
  }
  // 普通模式下放置模型
  loadModel(currentModelUrl, (model) => {
    model.position.setFromMatrixPosition(reticle.matrix);
    model.quaternion.setFromRotationMatrix(reticle.matrix);
    scene.add(model);
    placedModels.push(model);
  });
}

function loadModel(url, callback) {
  if (loadedModels[url]) {
    callback(loadedModels[url].clone());
    return;
  }
  const loader = new GLTFLoader();
  loader.load(url, function (gltf) {
    const model = gltf.scene;
    // 缩放和居中
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.x += (model.position.x - center.x);
    model.position.y += (model.position.y - center.y);
    model.position.z += (model.position.z - center.z);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 0.2 / maxDim; // AR场景建议小一点
    model.scale.set(scale, scale, scale);
    loadedModels[url] = model;
    callback(model.clone());
  });
} 