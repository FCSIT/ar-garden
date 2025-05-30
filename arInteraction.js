function initInteractions(App) {
    // 模型切换按钮
    document.getElementById('roseBtn').onclick = function() {
      App.setCurrentModel('rose.glb');
    };
    
    document.getElementById('tulipBtn').onclick = function() {
      App.setCurrentModel('tulip.glb');
    };
  
    // 回撤按钮
    document.getElementById('undoBtn').onclick = function() {
      App.undo();
    };
  
    // 删除按钮
    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.onclick = function() {
      const mode = !App.getDeleteMode();
      App.setDeleteMode(mode);
      deleteBtn.textContent = mode ? 'Click to Delete' : 'Delete';
      deleteBtn.classList.toggle('delete-mode', mode);
    };
  
    // 放置/删除
    App.renderer.domElement.addEventListener('pointerdown', function(event) {
      const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
  
      if (App.getDeleteMode()) {
        if (App.tryDeleteAt(mouse)) {
          deleteBtn.textContent = 'Delete';
          deleteBtn.classList.remove('delete-mode');
          App.setDeleteMode(false);
        }
        return;
      }
  
      // 放置 - 使用射线与水平面(y=0)的交点
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, App.camera);
      
      // 创建水平面
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectionPoint = new THREE.Vector3();
      
      // 计算射线与水平面的交点
      if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        App.placeModel(intersectionPoint);
      }
    });
  }
  