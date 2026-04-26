// 3D Orbital Simulation using Three.js
// Advanced Interactive Orbital Intelligence Viewer (Triple View System)

let scene, mainCamera, satCamera, pathCamera, attCamera, mainRenderer, satRenderer, pathRenderer, attRenderer;
let globe, satellite, orbit, futurePath, controls, satControls, pathControls, attControls, attSatellite, attScene;
let debrisList = [];
let swarmList = [];
let angle = 0;
let isHeatmapOn = false;
let animId;
let raycaster, mouse;
let tooltip;

// Attitude drag states
let isDraggingAtt = false;
let attStartX = 0, attStartY = 0;
let attBaseRotX = -15, attBaseRotY = 20;

const SAT_ORBIT_RADIUS = 6;
const SAT_INCLINATION = 30 * (Math.PI / 180);

function init3D() {
    const mainContainer = document.getElementById('orbit-3d-canvas');
    const satContainer = document.getElementById('satellite-3d-canvas');
    tooltip = document.getElementById('target-tooltip');

    if (!mainContainer || !satContainer) return;

    if (typeof THREE === 'undefined') {
        const errHtml = `<div class="sim-placeholder"><h2>3D SIMULATION OFFLINE</h2><p>Three.js failed to load.</p><div class="pulse-ring"></div></div>`;
        mainContainer.innerHTML = errHtml;
        satContainer.innerHTML = errHtml;
        return;
    }

    // 1. Shared Global Scene
    scene = new THREE.Scene();

    // Starfield Background
    const starGeo = new THREE.BufferGeometry();
    const starMats = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.8 });
    const starVerts = [];
    for (let i = 0; i < 600; i++) {  // Reduced from 1000 for better performance
        starVerts.push((Math.random() - 0.5) * 100);
        starVerts.push((Math.random() - 0.5) * 100);
        starVerts.push((Math.random() - 0.5) * 100);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    scene.add(new THREE.Points(starGeo, starMats));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 5, 5);
    scene.add(dirLight);

    // Objects setup
    setupObjects();

    // 2. Main Viewport (Globe Orbit View)
    mainCamera = new THREE.PerspectiveCamera(45, mainContainer.clientWidth / mainContainer.clientHeight, 0.1, 1000);
    mainCamera.position.set(0, 5, 15);

    mainRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, logarithmicDepthBuffer: true });
    mainRenderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
    mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap for performance
    mainContainer.appendChild(mainRenderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(mainCamera, mainRenderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxDistance = 50;
        controls.minDistance = 5;
    }

    // 3. Secondary Viewport (Satellite Close-Up)
    satCamera = new THREE.PerspectiveCamera(50, satContainer.clientWidth / satContainer.clientHeight, 0.1, 100);
    satCamera.position.set(3, 1, 3); // initial offset for tracking distance

    satRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); // No antialias on secondary
    satRenderer.setSize(satContainer.clientWidth, satContainer.clientHeight);
    satRenderer.setPixelRatio(1); // Fixed 1x for sub-panels
    satContainer.appendChild(satRenderer.domElement);

    // Add Mouse Controls to Satellite secondary canvas
    if (typeof THREE.OrbitControls !== 'undefined') {
        satControls = new THREE.OrbitControls(satCamera, satRenderer.domElement);
        satControls.enableDamping = true;
        satControls.dampingFactor = 0.05;
        satControls.maxDistance = 20;
        satControls.minDistance = 0.5;
    }

    // 4. Tertiary Viewport (Orbit Path/Forward Cam)
    const pathContainer = document.getElementById('path-3d-canvas');
    if (pathContainer) {
        pathCamera = new THREE.PerspectiveCamera(55, pathContainer.clientWidth / pathContainer.clientHeight, 0.1, 1000);
        pathCamera.position.set(0, 8, 0); // Above looking down, will be attached later

        pathRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); // No antialias on secondary
        pathRenderer.setSize(pathContainer.clientWidth, pathContainer.clientHeight);
        pathRenderer.setPixelRatio(1); // Fixed 1x for sub-panels
        pathContainer.appendChild(pathRenderer.domElement);

        if (typeof THREE.OrbitControls !== 'undefined') {
            pathControls = new THREE.OrbitControls(pathCamera, pathRenderer.domElement);
            pathControls.enableDamping = true;
            pathControls.dampingFactor = 0.05;
        }
    }

    // 5. Attitude Visualizer (Realistic 3D Satellite)
    const attContainer = document.getElementById('craft-3d');
    if (attContainer) {
        const w = attContainer.clientWidth || 200;
        const h = attContainer.clientHeight || 100;
        attScene = new THREE.Scene();
        attCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        attCamera.position.set(4, 2, 4);

        attRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); // Lightweight for HUD
        attRenderer.setClearColor(0x000000, 0);
        attRenderer.setSize(w, h);
        attRenderer.setPixelRatio(1);
        attContainer.innerHTML = '';
        attContainer.appendChild(attRenderer.domElement);
        attRenderer.domElement.style.display = 'block';
        attRenderer.domElement.style.zIndex = '50';

        attScene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const pLight = new THREE.PointLight(0xffffff, 2); // Brighter directional light
        pLight.position.set(5, 5, 5);
        attScene.add(pLight);

        // Build Realistic Satellite
        attSatellite = new THREE.Group();

        // Main Body (Golden/Metallic Foil)
        const bodyGeo = new THREE.BoxGeometry(1, 1.2, 1);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffd700, specular: 0xffffff, shininess: 100 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        attSatellite.add(body);

        // Solar Panels (Deep Blue)
        const panelGeo = new THREE.PlaneGeometry(2.5, 0.8);
        const panelMat = new THREE.MeshPhongMaterial({ color: 0x001a33, side: THREE.DoubleSide, specular: 0x00e5ff });

        const leftPanel = new THREE.Mesh(panelGeo, panelMat);
        leftPanel.position.x = -1.8;
        leftPanel.rotation.y = Math.PI / 2;
        attSatellite.add(leftPanel);

        const rightPanel = new THREE.Mesh(panelGeo, panelMat);
        rightPanel.position.x = 1.8;
        rightPanel.rotation.y = Math.PI / 2;
        attSatellite.add(rightPanel);

        // Panel connectors
        const connGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.6);
        const connMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        const conn = new THREE.Mesh(connGeo, connMat);
        conn.rotation.z = Math.PI / 2;
        attSatellite.add(conn);

        // Antenna
        const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8);
        const ant = new THREE.Mesh(antGeo, connMat);
        ant.position.y = 1;
        attSatellite.add(ant);

        const dishGeo = new THREE.SphereGeometry(0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const dish = new THREE.Mesh(dishGeo, new THREE.MeshPhongMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide }));
        dish.position.y = 1.4;
        dish.rotation.x = Math.PI;
        attSatellite.add(dish);

        attScene.add(attSatellite);

        if (typeof THREE.OrbitControls !== 'undefined') {
            attControls = new THREE.OrbitControls(attCamera, attRenderer.domElement);
            attControls.enableDamping = true;
            attControls.dampingFactor = 0.05;
            attControls.enableZoom = true;
            attControls.autoRotate = true;
            attControls.autoRotateSpeed = 0.8; // Reduced for lower CPU cost
        }
    }

    // Tools setup
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    mainContainer.addEventListener('mousemove', onMouseMove, false);

    window.addEventListener('resize', onWindowResize, false);

    // Setup Buttons
    const heatmapBtn = document.getElementById('btn-toggle-heatmap');
    if (heatmapBtn) {
        heatmapBtn.addEventListener('click', (e) => {
            isHeatmapOn = !isHeatmapOn;
            e.target.innerText = isHeatmapOn ? 'HEATMAP: ON' : 'HEATMAP: OFF';
            e.target.style.color = isHeatmapOn ? '#ffab00' : '';
            e.target.style.borderColor = isHeatmapOn ? '#ffab00' : '';

            orbit.material.color.setHex(isHeatmapOn ? 0xffab00 : 0x00e5ff);
            orbit.material.dashSize = isHeatmapOn ? 0.5 : 0.2;
        });
    }

    // Attitude Visualizer Interactions (Replaced with OrbitControls but keeping for manual offsets if needed)
    const attVis = document.querySelector('.attitude-visualizer');
    // OrbitControls handles mouse now, so we can simplify or remove manual drag if desired

    animate();
}

function setupObjects() {
    // WebGL Earth High-Res Textures
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const earthGeometry = new THREE.SphereGeometry(4, 32, 32);
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg'),
        bumpMap: textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png'),
        bumpScale: 0.15,
        specularMap: textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png'),
        specular: new THREE.Color('grey'),
        shininess: 15
    });
    globe = new THREE.Mesh(earthGeometry, earthMaterial);

    // Live Cloud Cover Layer fallback to known stable CDN
    const cloudGeometry = new THREE.SphereGeometry(4.06, 32, 32);
    const cloudTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-clouds.png',
        undefined, 
        undefined,
        (err) => {
            console.warn("[3D Globe] Primary cloud asset failed. Fallback active.");
            cloudTexture.image = new Image();
            cloudTexture.image.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
            cloudTexture.needsUpdate = true;
        }
    );
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);

    // Rotate clouds slowly relative to earth
    globe.add(clouds);
    globe.userData.clouds = clouds; // Reference for animation loop

    const atmGlow = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.15, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    scene.add(atmGlow);
    scene.add(globe);

    // Orbital Path (Nominal)
    const points = [];
    for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        points.push(new THREE.Vector3(SAT_ORBIT_RADIUS * Math.cos(a), 0, SAT_ORBIT_RADIUS * Math.sin(a)));
    }
    const orbitMat = new THREE.LineDashedMaterial({ color: 0x00e5ff, dashSize: 0.2, gapSize: 0.1, transparent: true, opacity: 0.5 });
    orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), orbitMat);
    orbit.computeLineDistances();
    orbit.rotation.z = SAT_INCLINATION;
    orbit.userData = { type: 'orbit', id: 'NOMINAL-PATH' };
    scene.add(orbit);

    // Rule 3: Digital Twin Future Path (Predictive AI Hologram)
    const futurePoints = [];
    for (let i = 0; i <= 20; i++) futurePoints.push(new THREE.Vector3(0, 0, 0));
    const futureMat = new THREE.LineDashedMaterial({ color: 0x00ff00, dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.8 });
    futurePath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(futurePoints), futureMat);
    futurePath.computeLineDistances();
    scene.add(futurePath);

    // Satellite Swarm (Multi-Tracker)
    const swarmCount = 8;
    for (let i = 0; i < swarmCount; i++) {
        const sMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff })
        );
        sMesh.userData = { type: 'satellite', id: `SWARM-${i + 1}`, alt: (390 + Math.random() * 20).toFixed(2) + ' km', vel: '7.66 km/s', status: 'NOMINAL (SWARM)' };
        scene.add(sMesh);

        // Randomize starting angle and slight inclination variance for the swarm
        const swarmAngle = (i / swarmCount) * Math.PI * 2 + (Math.random() * 0.5);
        const swarmInc = SAT_INCLINATION + (Math.random() - 0.5) * 0.2;
        swarmList.push({ mesh: sMesh, angleOffset: swarmAngle, incOffset: swarmInc });
    }

    // Main Satellite Marker - Swapped to Cuboid to show rotation
    satellite = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    satellite.userData = { type: 'satellite', id: 'SAT-01 (MOTHERSHIP)', alt: '400.12 km', vel: '7.66 km/s', status: 'NOMINAL' };

    // Sat Glow
    satellite.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
    ));
    scene.add(satellite);

    // Dynamic Orbital Debris Field (Kessler Syndrome Simulation)
    for (let i = 0; i < 20; i++) {  // Reduced from 45 for better performance
        const isHazard = Math.random() > 0.8;
        const color = isHazard ? 0xff1744 : 0xffab00; // Red for hazard, amber for standard

        // Use irregular shapes for debris (tetrahedron/dodecahedron)
        const geoType = Math.random() > 0.5 ? new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.05) : new THREE.DodecahedronGeometry(0.04 + Math.random() * 0.04);
        const dMesh = new THREE.Mesh(
            geoType,
            new THREE.MeshLambertMaterial({ color: color })
        );

        // Scattered altitudes (LEO range roughly 4.5 to 7 in scale)
        const r = 4.8 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2;
        dMesh.position.set(r * Math.cos(a), (Math.random() - 0.5) * 4, r * Math.sin(a));
        dMesh.userData = { type: 'debris', id: `DEB-${Math.floor(Math.random() * 9000) + 1000}`, vel: (8 + Math.random() * 4).toFixed(2) + ' km/s', hazard: isHazard };
        scene.add(dMesh);

        // Speed relates to orbit altitude (lower = faster)
        const speed = (0.005 + Math.random() * 0.015) * (isHazard ? -1 : 1);
        debrisList.push({
            mesh: dMesh,
            speed: speed,
            angle: a,
            radius: r,
            inc: (Math.random() - 0.5) * Math.PI * 2,
            rotSpeedX: Math.random() * 0.1,
            rotSpeedY: Math.random() * 0.1
        });
    }
}

function onWindowResize() {
    const mCont = document.getElementById('orbit-3d-canvas');
    if (mCont && mainCamera && mainRenderer) {
        mainCamera.aspect = mCont.clientWidth / mCont.clientHeight;
        mainCamera.updateProjectionMatrix();
        mainRenderer.setSize(mCont.clientWidth, mCont.clientHeight);
    }

    const sCont = document.getElementById('satellite-3d-canvas');
    if (sCont && satCamera && satRenderer) {
        satCamera.aspect = sCont.clientWidth / sCont.clientHeight;
        satCamera.updateProjectionMatrix();
        satRenderer.setSize(sCont.clientWidth, sCont.clientHeight);
    }

    const pCont = document.getElementById('path-3d-canvas');
    if (pCont && pathCamera && pathRenderer) {
        pathCamera.aspect = pCont.clientWidth / pCont.clientHeight;
        pathCamera.updateProjectionMatrix();
        pathRenderer.setSize(pCont.clientWidth, pCont.clientHeight);
    }

    const aCont = document.getElementById('craft-3d');
    if (aCont && attCamera && attRenderer) {
        attCamera.aspect = aCont.clientWidth / aCont.clientHeight;
        attCamera.updateProjectionMatrix();
        attRenderer.setSize(aCont.clientWidth, aCont.clientHeight);
    }
}

function onMouseMove(event) {
    const container = document.getElementById('orbit-3d-canvas');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, mainCamera); // Changed from camera to mainCamera
    const intersects = raycaster.intersectObjects([satellite, orbit, ...swarmList.map(s => s.mesh), ...debrisList.map(d => d.mesh)]);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 10) + 'px';
        tooltip.style.top = (event.clientY + 10) + 'px';

        if (obj.userData.type === 'satellite') {
            tooltip.innerHTML = `OBJECT ID: ${obj.userData.id}\nALT: ${obj.userData.alt}\nVEL: ${obj.userData.vel}\nSTATUS: ${window.globalSystemState === 'crit' ? 'CRITICAL EVASION REQ' : obj.userData.status}`;
            tooltip.style.borderColor = 'var(--state-safe)';
            document.body.style.cursor = 'pointer';
        } else if (obj.userData.type === 'debris') {
            tooltip.innerHTML = `OBJECT ID: ${obj.userData.id}\nTYPE: DEBRIS\nVEL: ${obj.userData.vel}\nSTATUS: HAZARD`;
            tooltip.style.borderColor = 'var(--state-crit)';
            document.body.style.cursor = 'crosshair';
        } else if (obj.userData.type === 'orbit') {
            tooltip.innerHTML = `PATH ID: ${obj.userData.id}\nPREDICTED T+30m`;
            tooltip.style.borderColor = 'var(--text-muted)';
            document.body.style.cursor = 'default';
        }
    } else {
        tooltip.style.display = 'none';
        document.body.style.cursor = 'default';
    }
}

const TARGET_FPS = 24; // Reduced from 30 for better thermal headroom
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;
let isVisible = true;
let gpuSafetyActive = false;
let _frameCount = 0; // For sub-sampling certain expensive operations

// CPU SAVER: Listen for AI Engine hardware crash alerts
window.addEventListener('orbitx-gpu-failure', (e) => {
    console.error("[3D Globe] Hardware Alarm: High CPU software rendering detected. Halting 3D systems.");
    gpuSafetyActive = true;

    // Replace canvases with static alert UI to save CPU
    const canvases = ['orbit-3d-canvas', 'satellite-3d-canvas'];
    canvases.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="sim-placeholder safe-mode-bg"><h2>SAFE MODE ACTIVE</h2><p>3D Visualization Suspended to save CPU cycles.</p></div>`;
    });
});

// PERFORMANCE FIX: Use IntersectionObserver to stop rendering when canvases are hidden
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        const wasVisible = isVisible;
        isVisible = entries.some(e => e.isIntersecting);
        // PERFORMANCE RESTART: Re-kick animation if it was paused
        if (isVisible && !wasVisible && !gpuSafetyActive) {
            animate();
        }
    }, { threshold: 0.1 });

    // Check for main container at least
    setTimeout(() => {
        const mCont = document.getElementById('orbit-3d-canvas');
        if (mCont) observer.observe(mCont);
    }, 1000);
}

function animate(timestamp = 0) {
    if (gpuSafetyActive) return; // KILL LOOP: Zeroes out CPU consumption on AMD failure
    if (!isVisible) return; // STOP LOOP: Pause when hidden to save cycles

    animId = requestAnimationFrame(animate);

    // PERFORMANCE FIX: Skip rendering if not visible or too soon
    if (!isVisible || (timestamp - lastFrameTime < FRAME_INTERVAL)) return;
    lastFrameTime = timestamp;

    // Rotate Globe
    globe.rotation.y += 0.001;
    if (globe.userData.clouds) {
        globe.userData.clouds.rotation.y += 0.0005; // Independent cloud drift
    }

    // Move satellite along orbit
    angle -= 0.005;

    // Cinematic Zoom on Main Camera
    if (window.globalSystemState === 'crit') {
        if (mainCamera.fov > 35) {
            mainCamera.fov -= 0.5;
            mainCamera.updateProjectionMatrix();
        }
    } else {
        if (mainCamera.fov < 45) {
            mainCamera.fov += 0.5;
            mainCamera.updateProjectionMatrix();
        }
    }

    // Orbit Equation with Inclination
    const oldSatPos = satellite.position.clone();

    const px = SAT_ORBIT_RADIUS * Math.cos(angle);
    const py = SAT_ORBIT_RADIUS * Math.sin(angle);

    // Apply inclination rotation
    satellite.position.x = px * Math.cos(SAT_INCLINATION);
    satellite.position.y = px * Math.sin(SAT_INCLINATION);
    satellite.position.z = py;

    // ORIENTATION FIX: Point satellite in direction of travel on Globe
    satellite.lookAt(0, 0, 0); 
    satellite.rotateY(Math.PI / 2); // Correct orientation per orbital vector
    
    // Secondary Sat-Cam tightly tracks the satellite
    const deltaPos = satellite.position.clone().sub(oldSatPos);



    if (satControls && satCamera) {
        satCamera.position.add(deltaPos);
        satControls.target.copy(satellite.position);
        satControls.update();
    } else if (satCamera) {
        satCamera.position.x = satellite.position.x + 3;
        satCamera.position.y = satellite.position.y + 1;
        satCamera.position.z = satellite.position.z + 3;
        satCamera.lookAt(satellite.position);
    }

    // Tertiary Path-Cam tracks forward along the orbit (dashcam feel)
    if (pathCamera) {
        const lookAheadAngle = angle - 0.5;
        const lookTgt = new THREE.Vector3(
            (SAT_ORBIT_RADIUS * Math.cos(lookAheadAngle)) * Math.cos(SAT_INCLINATION),
            (SAT_ORBIT_RADIUS * Math.cos(lookAheadAngle)) * Math.sin(SAT_INCLINATION),
            SAT_ORBIT_RADIUS * Math.sin(lookAheadAngle)
        );
        if (pathControls) {
            pathCamera.position.add(deltaPos);
            pathControls.target.copy(lookTgt);
            pathControls.update();
        } else {
            pathCamera.position.x = satellite.position.x;
            pathCamera.position.y = satellite.position.y + 0.5;
            pathCamera.position.z = satellite.position.z;
            pathCamera.lookAt(lookTgt);
        }
    }

    // Rule 3: Digital Twin Path Update — only every 5 frames to avoid per-frame geometry GC
    _frameCount++;
    if (futurePath && (_frameCount % 5 === 0)) {
        const futurePositions = [];
        for (let i = 0; i <= 20; i++) {
            const fAngle = angle - (i * 0.05);
            const fx = SAT_ORBIT_RADIUS * Math.cos(fAngle);
            const fz = SAT_ORBIT_RADIUS * Math.sin(fAngle);
            const v = new THREE.Vector3(fx * Math.cos(SAT_INCLINATION), fx * Math.sin(SAT_INCLINATION), fz);
            futurePositions.push(v);
        }
        futurePath.geometry.setFromPoints(futurePositions);
        futurePath.computeLineDistances();
        
        if (window.globalSystemState === 'crit') {
            futurePath.material.color.setHex(0xff0000);
            futurePath.material.dashSize = 0.5;
        } else {
            futurePath.material.color.setHex(0x00ff00);
            futurePath.material.dashSize = 0.1;
        }
    }

    // Update Swarm Positions
    swarmList.forEach(swarmSat => {
        const sAngle = angle + swarmSat.angleOffset;
        const px = SAT_ORBIT_RADIUS * Math.cos(sAngle);
        const py = SAT_ORBIT_RADIUS * Math.sin(sAngle);

        swarmSat.mesh.position.x = px * Math.cos(swarmSat.incOffset);
        swarmSat.mesh.position.y = px * Math.sin(swarmSat.incOffset);
        swarmSat.mesh.position.z = py;
    });

    if (controls) controls.update();

    // Move debris field
    debrisList.forEach((d, idx) => {
        d.angle += d.speed;
        d.mesh.position.x = d.radius * Math.cos(d.angle) * Math.cos(d.inc);
        d.mesh.position.y = d.radius * Math.cos(d.angle) * Math.sin(d.inc);
        d.mesh.position.z = d.radius * Math.sin(d.angle);

        // Tumbling effect
        d.mesh.rotation.x += d.rotSpeedX;
        d.mesh.rotation.y += d.rotSpeedY;

        if (window.globalSystemState === 'crit' && d.mesh.userData.hazard) {
            d.mesh.material.color.setHex((Math.floor(Date.now() / 200) % 2 === 0) ? 0xffffff : 0xff1744); // Strobe flash effect for critical debris
        } else {
            d.mesh.material.color.setHex(d.mesh.userData.hazard ? 0xff1744 : 0xffab00);
        }

        // Basic proximity check (Kessler calculation) against main satellite
        if (d.mesh.userData.hazard) {
            const dist = d.mesh.position.distanceTo(satellite.position);
            if (dist < 0.5 && window.globalSystemState !== 'crit') {
                // Preemptively trigger collision warning logic visually
                d.mesh.material.color.setHex(0xffffff);
            }
        }
    });

    // GUI Updates
    const liveInc = document.getElementById('live-inclination');
    if (liveInc) liveInc.innerText = (51.6 + (Math.sin(angle) * 0.1)).toFixed(2) + '°';

    const pValue = Math.sin(angle * 2) * 5;
    const rValue = Math.cos(angle * 1.5) * 3;
    const yValue = (angle * 2 * 180 / Math.PI % 360) * -1; // Reduced from 20x to 2x for medium speed

    const finalRotX = (attBaseRotX + pValue) * (Math.PI / 180);
    const finalRotY = (attBaseRotY + yValue) * (Math.PI / 180);
    const finalRotZ = (rValue) * (Math.PI / 180);

    const attPitch = document.getElementById('att-pitch');
    if (attPitch) attPitch.innerText = (pValue).toFixed(1) + '°';
    const attRoll = document.getElementById('att-roll');
    if (attRoll) attRoll.innerText = (rValue).toFixed(1) + '°';
    const attYaw = document.getElementById('att-yaw');
    if (attYaw) attYaw.innerText = (yValue % 360).toFixed(1) + '°';

    /* 
    // TELEMETRY LOCK: Removed to allow full manual mouse-choice rotation 
    if (attSatellite) {
        attSatellite.rotation.set(finalRotX, finalRotY, finalRotZ);
    }
    */

    if (attCamera) attCamera.lookAt(0, 0, 0); // Viewpoint Stability Check
    if (attControls) attControls.update();

    // Render all streams
    if (mainRenderer && mainCamera) mainRenderer.render(scene, mainCamera);
    if (satRenderer && satCamera) satRenderer.render(scene, satCamera);
    if (pathRenderer && pathCamera) pathRenderer.render(scene, pathCamera);
    if (attRenderer && attCamera) attRenderer.render(attScene, attCamera);
}

// Give DOM time to measure canvas container before initializing
setTimeout(init3D, 500);
