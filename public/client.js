// Socket.IO connection
const socket = io();

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color('skyblue');

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

camera.position.set(0, 10, 20);
camera.lookAt(0, 0, 0);

// Player objects
const players = {};

// Lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);
scene.add(new THREE.AmbientLight(0x404040));

// Platform definitions (matching server)
const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000, // Black with red trim added separately
    roughness: 0.5,
    metalness: 0.1
});

const baseFloor = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 30), platformMaterial);
baseFloor.position.set(0, -0.5, 0);
baseFloor.receiveShadow = true;
scene.add(baseFloor);

const platformGeometry = new THREE.BoxGeometry(10, 1, 10);
const platforms = [
    new THREE.Mesh(platformGeometry, platformMaterial), // Central
    new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), platformMaterial), // Elevated
    new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), platformMaterial), // Mid-level
    new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), platformMaterial), // High
    new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), platformMaterial)  // Additional high
];
platforms[0].position.set(0, 1, 0);
platforms[1].position.set(7.5, 2, 7.5);
platforms[2].position.set(-7.5, 1.5, -7.5);
platforms[3].position.set(12.5, 3, 12.5);
platforms[4].position.set(-12.5, 2.5, -12.5);

platforms.forEach(p => {
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
    const edges = new THREE.EdgesGeometry(p.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    line.position.copy(p.position);
    scene.add(line);
});

// Player creation
function createPlayer(id, position, isIt) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
        color: isIt ? 0xff0000 : 0x00ff00,
        emissive: isIt ? 0xff0000 : 0x000000,
        emissiveIntensity: isIt ? 0.5 : 0
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.position.set(position.x, position.y, position.z);
    scene.add(cube);
    players[id] = cube;
}

// Socket.IO events
socket.on('currentPlayers', (serverPlayers) => {
    Object.entries(serverPlayers).forEach(([id, p]) => createPlayer(id, p.position, p.isIt));
});

socket.on('newPlayer', (data) => {
    createPlayer(data.id, data.position, data.isIt);
});

socket.on('playerDisconnected', (id) => {
    scene.remove(players[id]);
    delete players[id];
});

socket.on('updatePlayers', (serverPlayers) => {
    Object.entries(serverPlayers).forEach(([id, p]) => {
        if (players[id]) players[id].position.set(p.position.x, p.position.y, p.position.z);
    });
    updateUI(serverPlayers);
});

socket.on('updateIt', (itId) => {
    Object.values(players).forEach(p => {
        const isIt = p === players[itId];
        p.material.color.set(isIt ? 0xff0000 : 0x00ff00);
        p.material.emissive.set(isIt ? 0xff0000 : 0x000000);
        p.material.emissiveIntensity = isIt ? 0.5 : 0;
    });
});

socket.on('playSound', (type) => {
    console.log(`Playing sound: ${type}`);
});

// Input handling
const inputs = { forward: false, backward: false, left: false, right: false, jump: false };
window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': inputs.forward = true; break;
        case 'KeyS': inputs.backward = true; break;
        case 'KeyA': inputs.left = true; break;
        case 'KeyD': inputs.right = true; break;
        case 'Space': inputs.jump = true; break;
    }
    socket.emit('playerInput', inputs);
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': inputs.forward = false; break;
        case 'KeyS': inputs.backward = false; break;
        case 'KeyA': inputs.left = false; break;
        case 'KeyD': inputs.right = false; break;
        case 'Space': inputs.jump = false; break;
    }
    socket.emit('playerInput', inputs);
});

// UI toggle
let uiVisible = true;
document.getElementById('ui').style.display = 'block';
window.addEventListener('keypress', (e) => {
    if (e.code === 'KeyT') {
        uiVisible = !uiVisible;
        document.getElementById('ui').style.display = uiVisible ? 'block' : 'none';
    }
});

// UI update
function updateUI(serverPlayers) {
    const scores = Object.values(serverPlayers).map(p => p.score || 0);
    const bestScore = Math.max(...scores);
    const bestPlayerId = Object.entries(serverPlayers).find(([_, p]) => p.score === bestScore)?.[0] || '-';
    document.getElementById('best-player').textContent = bestPlayerId.slice(0, 5);
    document.getElementById('highest-score').textContent = bestScore;
    document.getElementById('player-count').textContent = Object.keys(serverPlayers).length;
    document.getElementById('fps').textContent = Math.round(1000 / (performance.now() - lastFrameTime));
}

// Animation loop
let lastFrameTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    lastFrameTime = performance.now();
}
animate();

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});