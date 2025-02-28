const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Game state
let players = {}; // { id: { position: {x, y, z}, velocityY: 0, onGround: true, isIt: false, score: 0, input: {} } }
let itPlayerId = null;
let lastTagTime = 0;
const TAG_COOLDOWN = 5000; // 5 seconds cooldown for tagging
const MOVEMENT_SPEED = 0.1;
const JUMP_FORCE = 0.25;
const GRAVITY = 0.02;

// Platforms inspired by the obstacle course description
const platforms = [
    { x_min: -15, x_max: 15, z_min: -15, z_max: 15, y_top: 0 }, // Large blue padded base floor
    { x_min: -5, x_max: 5, z_min: -5, z_max: 5, y_top: 1 }, // Central platform
    { x_min: 5, x_max: 10, z_min: 5, z_max: 10, y_top: 2 }, // Elevated platform
    { x_min: -10, x_max: -5, z_min: -10, z_max: -5, y_top: 1.5 }, // Mid-level platform
    { x_min: 10, x_max: 15, z_min: 10, z_max: 15, y_top: 3 }, // High platform
    { x_min: -15, x_max: -10, z_min: -15, z_max: -10, y_top: 2.5 }, // Additional high platform
];

// Serve static client files
app.use(express.static('public'));

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Initialize new player
    players[socket.id] = {
        position: { x: 0, y: 1, z: 0 }, // Spawn on central platform
        velocityY: 0,
        onGround: true,
        isIt: false,
        score: 0,
        input: {}
    };

    // Assign "it" player if none exists
    if (!itPlayerId) {
        itPlayerId = socket.id;
        players[socket.id].isIt = true;
    }

    // Notify existing players and send game state to new player
    socket.broadcast.emit('newPlayer', { id: socket.id, position: players[socket.id].position, isIt: players[socket.id].isIt });
    socket.emit('currentPlayers', players);

    // Handle player input
    socket.on('playerInput', (input) => {
        if (players[socket.id]) {
            players[socket.id].input = input;
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        delete players[socket.id];
        if (itPlayerId === socket.id) {
            const ids = Object.keys(players);
            if (ids.length > 0) {
                itPlayerId = ids[Math.floor(Math.random() * ids.length)];
                players[itPlayerId].isIt = true;
                io.emit('updateIt', itPlayerId);
            } else {
                itPlayerId = null;
            }
        }
        io.emit('playerDisconnected', socket.id);
        console.log('Player disconnected:', socket.id);
    });
});

// Game loop (60 FPS)
setInterval(() => {
    Object.entries(players).forEach(([id, player]) => {
        const input = player.input;

        // Movement
        if (input.forward) player.position.z -= MOVEMENT_SPEED;
        if (input.backward) player.position.z += MOVEMENT_SPEED;
        if (input.left) player.position.x -= MOVEMENT_SPEED;
        if (input.right) player.position.x += MOVEMENT_SPEED;
        if (input.jump && player.onGround) {
            player.velocityY = JUMP_FORCE;
            player.onGround = false;
            io.emit('playSound', 'jump');
        }

        // Apply gravity
        player.velocityY -= GRAVITY;
        player.position.y += player.velocityY;

        // Collision with platforms (bottom of cube)
        player.onGround = false;
        if (player.position.y - 0.5 <= 0) {
            player.position.y = 0.5;
            player.velocityY = 0;
            player.onGround = true;
        } else {
            for (const platform of platforms) {
                if (
                    player.position.x >= platform.x_min &&
                    player.position.x <= platform.x_max &&
                    player.position.z >= platform.z_min &&
                    player.position.z <= platform.z_max &&
                    player.position.y - 0.5 <= platform.y_top &&
                    player.velocityY < 0
                ) {
                    player.position.y = platform.y_top + 0.5;
                    player.velocityY = 0;
                    player.onGround = true;
                    break;
                }
            }
        }
    });

    // Tagging logic
    if (itPlayerId && Date.now() - lastTagTime > TAG_COOLDOWN) {
        const itPlayer = players[itPlayerId];
        for (const [id, player] of Object.entries(players)) {
            if (id === itPlayerId) continue;
            const dist = Math.sqrt(
                (itPlayer.position.x - player.position.x) ** 2 +
                (itPlayer.position.y - player.position.y) ** 2 +
                (itPlayer.position.z - player.position.z) ** 2
            );
            if (dist < 1) {
                const oldIt = itPlayerId;
                players[oldIt].score += 10;
                players[oldIt].isIt = false;
                players[id].isIt = true;
                itPlayerId = id;
                lastTagTime = Date.now();
                io.emit('updateIt', itPlayerId);
                io.emit('playSound', 'tag');
                break;
            }
        }
    }

    // Update clients
    io.emit('updatePlayers', players);
}, 1000 / 60);

// Scoring for non-"it" players (1 point per second)
setInterval(() => {
    Object.entries(players).forEach(([id, player]) => {
        if (!player.isIt) player.score += 1;
    });
    io.emit('updatePlayers', players);
}, 5000);

server.listen(3000, () => console.log('Server running on port 3000'));