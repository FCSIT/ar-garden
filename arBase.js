// base.js
window.FlowerApp = (function() {
    let scene, camera, renderer, controls;
    let loadedModels = {};
    let placedModels = [];
    let deleteMode = false;
    let currentModelName = 'rose.glb';
    let videoElement;
    let arMode = false;
  
    function initScene(dom) {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);
  
      // 创建视频元素
      videoElement = document.createElement('video');
      videoElement.setAttribute('playsinline', '');
      videoElement.setAttribute('autoplay', '');
      videoElement.style.display = 'none';
      document.body.appendChild(videoElement);
  
      // 创建 AR 相机
      camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 0, 5);
  
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      (dom || document.body).appendChild(renderer.domElement);
  
      // 添加环境光
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(1, 1, 1);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  
      // 添加地面网格
      const gridHelper = new THREE.GridHelper(10, 10);
      scene.add(gridHelper);
  
      controls = new THREE.OrbitControls(camera, renderer.domElement);
    }
  
    async function startAR() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          } 
        });
        
        videoElement.srcObject = stream;
        await videoElement.play();
  
        // 创建视频纹理
        const videoTexture = new THREE.VideoTexture(videoElement);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.format = THREE.RGBFormat;
  
        // 创建背景平面
        const planeGeometry = new THREE.PlaneGeometry(2, 2);
        const planeMaterial = new THREE.MeshBasicMaterial({
          map: videoTexture,
          side: THREE.DoubleSide
        });
        const backgroundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        backgroundPlane.position.z = -1;
        scene.add(backgroundPlane);
  
        arMode = true;
        return true;
      } catch (error) {
        console.error('Error accessing camera:', error);
        return false;
      }
    }
  
    function stopAR() {
      if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      arMode = false;
    }
  
    function loadModel(name, callback) {
      if (loadedModels[name]) {
        callback(loadedModels[name].clone());
        return;
      }
      const loader = new THREE.GLTFLoader();
      loader.load(name, function(gltf) {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.x += (model.position.x - center.x);
        model.position.y += (model.position.y - center.y);
        model.position.z += (model.position.z - center.z);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        model.scale.set(scale, scale, scale);
  
        loadedModels[name] = model;
        callback(model.clone());
      });
    }
  
    function placeModel(pos, callback) {
      loadModel(currentModelName, (model) => {
        model.position.copy(pos);
        scene.add(model);
        placedModels.push(model);
        if (callback) callback(model);
      });
    }
  
    function undo() {
      const last = placedModels.pop();
      if (last) scene.remove(last);
    }
  
    function setDeleteMode(mode) {
      deleteMode = mode;
    }
  
    function tryDeleteAt(mouse) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(placedModels, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !placedModels.includes(obj)) {
          obj = obj.parent;
        }
        scene.remove(obj);
        placedModels = placedModels.filter(m => m !== obj);
        return true;
      }
      return false;
    }
  
    function animate() {
      requestAnimationFrame(animate);
      if (arMode && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        renderer.render(scene, camera);
      } else if (!arMode) {
        controls.update();
        renderer.render(scene, camera);
      }
    }
  
    function setCurrentModel(name) {
      currentModelName = name;
    }
  
    function getDeleteMode() {
      return deleteMode;
    }
  
    return {
      initScene,
      loadModel,
      placeModel,
      undo,
      setDeleteMode,
      tryDeleteAt,
      animate,
      setCurrentModel,
      getDeleteMode,
      startAR,
      stopAR,
      get camera() { return camera; },
      get renderer() { return renderer; },
      get scene() { return scene; }
    };
  })();