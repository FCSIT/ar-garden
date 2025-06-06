import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';

// Debug helper
function debugLog(message) {
  console.log(message);
  if (window.debugDiv) {
    window.debugDiv.innerHTML += `<div>${message}</div>`;
    window.debugDiv.scrollTop = window.debugDiv.scrollHeight;
  }
}

/**
 * Container class to manage connecting to the WebXR Device API
 * and handle rendering on every frame.
 */
class App {
  constructor() {
    this.reticle = null;
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.stabilized = false;
    this.xrSession = null;
    debugLog('App initialized');
  }

  /**
   * Run when the Start AR button is pressed.
   */
  activateXR = async () => {
    try {
      debugLog('Starting AR session...');
      // If there's already a session, end it
      if (this.xrSession) {
        debugLog('Ending existing session...');
        await this.xrSession.end();
        this.xrSession = null;
      }

      // Initialize a WebXR session using "immersive-ar".
      this.xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test", "dom-overlay"],
        domOverlay: { root: document.body }
      });
      debugLog('AR session created successfully');

      // Create the canvas that will contain our camera's background and our virtual scene.
      this.createXRCanvas();

      // With everything set up, start the app.
      await this.onSessionStarted();
    } catch(e) {
      console.error(e);
      debugLog(`Error activating AR: ${e.message}`);
      onNoXRDevice();
    }
  }

  /**
   * Add a canvas element and initialize a WebGL context that is compatible with WebXR.
   */
  createXRCanvas() {
    debugLog('Creating XR canvas...');
    this.canvas = document.createElement("canvas");
    document.body.appendChild(this.canvas);
    this.gl = this.canvas.getContext("webgl", {xrCompatible: true});

    this.xrSession.updateRenderState({
      baseLayer: new XRWebGLLayer(this.xrSession, this.gl)
    });
    debugLog('XR canvas created successfully');
  }

  /**
   * Called when the XRSession has begun. Here we set up our three.js
   * renderer and kick off the render loop.
   */
  async onSessionStarted() {
    debugLog('Session started, setting up scene...');
    // Add the `ar` class to our body, which will hide our 2D components
    document.body.classList.add('ar');

    // To help with working with 3D on the web, we'll use three.js.
    this.setupThreeJs();

    // Setup an XRReferenceSpace using the "local" coordinate system.
    this.localReferenceSpace = await this.xrSession.requestReferenceSpace('local');
    debugLog('Local reference space created');

    // Create another XRReferenceSpace that has the viewer as the origin.
    this.viewerSpace = await this.xrSession.requestReferenceSpace('viewer');
    debugLog('Viewer reference space created');
    
    // Perform hit testing using the viewer as origin.
    this.hitTestSource = await this.xrSession.requestHitTestSource({ space: this.viewerSpace });
    this.hitTestSourceRequested = true;
    debugLog('Hit test source created');

    // Start a rendering loop using this.onXRFrame.
    this.xrSession.requestAnimationFrame(this.onXRFrame);

    // Add select event listener
    this.xrSession.addEventListener('select', this.onSelect);
    debugLog('Scene setup complete');
  }

  /**
   * Called on the XRSession's requestAnimationFrame.
   * Called with the time and XRPresentationFrame.
   */
  onXRFrame = (time, frame) => {
    this.xrSession.requestAnimationFrame(this.onXRFrame);
    const framebuffer = this.xrSession.renderState.baseLayer.framebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    const pose = frame.getViewerPose(this.localReferenceSpace);
    if (pose) {
      const view = pose.views[0];
      const viewport = this.xrSession.renderState.baseLayer.getViewport(view);
      this.renderer.setSize(viewport.width, viewport.height);
      this.camera.matrix.fromArray(view.transform.matrix);
      this.camera.projectionMatrix.fromArray(view.projectionMatrix);
      this.camera.updateMatrixWorld(true);
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (!this.stabilized && hitTestResults.length > 0) {
        this.stabilized = true;
        document.body.classList.add("stabilized");
        debugLog('Surface detected, AR stabilized');
      }
      if (hitTestResults.length > 0) {
        const hitPose = hitTestResults[0].getPose(this.localReferenceSpace);
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(hitPose.transform.matrix);
      } else {
        this.reticle.visible = false;
      }
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Initialize three.js specific rendering code, including a WebGLRenderer,
   * a demo scene, and a camera for viewing the 3D content.
   */
  setupThreeJs() {
    debugLog('Setting up Three.js...');
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      canvas: this.canvas,
      context: this.gl
    });
    this.renderer.autoClear = false;


    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    this.scene = new THREE.Scene();
    this.scene.add(hemiLight);
    // envioment light
    const ambient = new THREE.AmbientLight(0xffffff, 4);
    this.scene.add(ambient);
    const ambient2 = new THREE.AmbientLight(0xffffff, 2);
    this.scene.add(ambient2);

    // add RoomEnvironment，only set cene.environment， dont set background
    const pmremGenerator = new PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    const envMap = pmremGenerator.fromScene(environment).texture;
    this.scene.environment = envMap;
    // dont set this.scene.background，cfm no change background

    // New reticle
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
    debugLog('Three.js setup complete');
  }

  /**
   * Handle the select event
   */
  onSelect = () => {
    if (window.canPlaceModel && !window.canPlaceModel()) {
      debugLog('Placement not started, ignoring click');
      return;
    }
    if (window.loadCurrentModel) {
      debugLog('Placing model...');
      window.loadCurrentModel((model) => {
        // Use only reticle's position and quaternion, do not override scale
        model.position.setFromMatrixPosition(this.reticle.matrix);
        model.quaternion.setFromRotationMatrix(this.reticle.matrix);
        model.traverse(child => { if(child.isMesh && child.material){ if ('metalness' in child.material) child.material.metalness = 0; if ('roughness' in child.material) child.material.roughness = 0.5; child.material.needsUpdate = true; }});
        this.scene.add(model);
        if (window.placedModels) window.placedModels.push(model);
        debugLog('Model placed successfully');
        // Automatically disable canPlace after placement
        if (window.canPlaceModel) window.canPlace = false;
      });
    } else {
      debugLog('Model not loaded yet');
    }
  }
}

// Initialize the app after class definition
window.app = new App();

/**
 * Query for WebXR support. If there's no support for the `immersive-ar` mode,
 * show an error.
 */
(async function() {
  debugLog('Checking WebXR support in app.js...');
  if ('xr' in navigator) {
    try {
      const isArSessionSupported = await navigator.xr.isSessionSupported('immersive-ar');
      debugLog(`WebXR AR support in app.js: ${isArSessionSupported}`);
      
      if (isArSessionSupported) {
        document.getElementById("enter-ar").addEventListener("click", window.app.activateXR);
        document.getElementById("enter-ar-info").style.display = "block";
        document.getElementById("unsupported-info").style.display = "none";
      } else {
        debugLog('AR session not supported in app.js');
        onNoXRDevice();
      }
    } catch (e) {
      debugLog(`Error checking AR support in app.js: ${e.message}`);
      onNoXRDevice();
    }
  } else {
    debugLog('WebXR API not available in app.js');
    onNoXRDevice();
  }
})();

/**
 * Toggle the class on the body and updates the status message for AR-specific elements.
 */
function onNoXRDevice() {
  document.body.classList.add('ar-unsupported');
  document.getElementById("enter-ar-info").style.display = "none";
  document.getElementById("unsupported-info").style.display = "block";
  debugLog('WebXR not supported on this device');
}