const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const ball = { x: 400, y: 250, vx: 0, vy: 0, radius: 15 };

const predefinedPositions = [
    { x: 100, y: 250 }, // Jugador 1 (rojo) - izquierda
    { x: 700, y: 250 }  // Jugador 2 (azul) - derecha
];

const fieldWidth = 800;
const fieldHeight = 500;

const distance = (x1, y1, x2, y2) => {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
};

const handlePlayerCollision = (player) => {
    if (player.x < 20) player.x = 20; 
    else if (player.x > fieldWidth - 20) player.x = fieldWidth - 20; 
    if (player.y < 20) player.y = 20; 
    else if (player.y > fieldHeight - 20) player.y = fieldHeight - 20; 
};

const handleBallCollision = (player, ball) => {
    const dist = distance(player.x, player.y, ball.x, ball.y);
    if (dist < 35) {
        const overlap = 35 - dist;
        const dx = (ball.x - player.x) / dist;
        const dy = (ball.y - player.y) / dist;

        if (player.canMove) {
            player.x -= dx * overlap;
            player.y -= dy * overlap;
            const kickStrength = 0.5;
            ball.vx += dx * kickStrength;
            ball.vy += dy * kickStrength;
        }
    }
};

const handlePlayerToPlayerCollision = (player1, player2) => {
    const dist = distance(player1.x, player1.y, player2.x, player2.y);
    if (dist < 40) {
        const overlap = 40 - dist;
        const dx = (player1.x - player2.x) / dist;
        const dy = (player1.y - player2.y) / dist;

        player1.x += dx * overlap * 0.5;
        player1.y += dy * overlap * 0.5;
        player2.x -= dx * overlap * 0.5;
        player2.y -= dy * overlap * 0.5;
    }
};

const updateBallPosition = () => {
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < ball.radius) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
    } else if (ball.x > fieldWidth - ball.radius) {
        ball.x = fieldWidth - ball.radius;
        ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < ball.radius) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
    } else if (ball.y > fieldHeight - ball.radius) {
        ball.y = fieldHeight - ball.radius;
        ball.vy = -Math.abs(ball.vy);
    }

    if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1) {
        ball.vx = 0;
        ball.vy = 0;
    }
};

// Modificación de la función resetGame
const resetGame = (scoringTeam) => {
    // Restablecer posiciones de los jugadores
    Object.keys(players).forEach((id, index) => {
        players[id].x = predefinedPositions[index].x;
        players[id].y = predefinedPositions[index].y;
        players[id].canMove = true;
    });

    // Colocar la pelota **adelante** del jugador contrario
    if (scoringTeam === 1) {
        // Si el equipo 1 (rojo) anotó, la pelota debe aparecer **a la derecha del campo** (cerca del jugador azul)
        ball.x = players[Object.keys(players)[1]].x + 40;  // 40 píxeles adelante del jugador azul
        ball.y = players[Object.keys(players)[1]].y;
    } else {
        // Si el equipo 2 (azul) anotó, la pelota debe aparecer **a la izquierda del campo** (cerca del jugador rojo)
        ball.x = players[Object.keys(players)[0]].x - 40;  // 40 píxeles adelante del jugador rojo
        ball.y = players[Object.keys(players)[0]].y;
    }

    // Desacelerar la pelota
    ball.vx = 0;
    ball.vy = 0;
};

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado: ' + socket.id);

    let position = predefinedPositions[Object.keys(players).length % predefinedPositions.length];

    players[socket.id] = {
        x: position.x,
        y: position.y,
        color: Object.keys(players).length % 2 === 0 ? 'red' : 'blue',
        canMove: true,
        vx: 0,
        vy: 0,
        id: socket.id,
        name: `Jugador ${Object.keys(players).length}` // Nombre del jugador
    };

    socket.emit('init', { players, ball });

    socket.on('movement', (movementData) => {
        const player = players[socket.id];
        if (!player.canMove) return;

        player.vx *= 0.9;
        player.vy *= 0.9;

        const playerSpeed = 0.5;

        if (movementData.left) player.vx -= playerSpeed;
        if (movementData.up) player.vy -= playerSpeed;
        if (movementData.right) player.vx += playerSpeed;
        if (movementData.down) player.vy += playerSpeed;

        player.x += player.vx;
        player.y += player.vy;

        handlePlayerCollision(player);
        handleBallCollision(player, ball);
    });

    socket.on('touchBall', () => {
        const player = players[socket.id];
        player.canTouchBall = true; // Permitir tocar la pelota
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado: ' + socket.id);
        delete players[socket.id];
    });

    setInterval(() => {
        updateBallPosition();

        const playerIds = Object.keys(players);
        if (playerIds.length < 2) return; // Asegurarnos de que ambos jugadores estén presentes

        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                handlePlayerToPlayerCollision(players[playerIds[i]], players[playerIds[j]]);
            }
        }

        // Marcar goles
        if (ball.x <= 20 && ball.y > (fieldHeight / 2 - 50) && ball.y < (fieldHeight / 2 + 50)) {
            io.emit('goal', { team: 2 }); // Emitir gol para equipo 2 (azul)
            resetGame(1); // El equipo 1 (rojo) anotó, coloca la pelota **del lado del jugador 2 (azul)**
        } else if (ball.x >= fieldWidth - 20 && ball.y > (fieldHeight / 2 - 50) && ball.y < (fieldHeight / 2 + 50)) {
            io.emit('goal', { team: 1 }); // Emitir gol para equipo 1 (rojo)
            resetGame(2); // El equipo 2 (azul) anotó, coloca la pelota **del lado del jugador 1 (rojo)**
        }

        io.emit('state', { players, ball });
    }, 1000 / 60);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
