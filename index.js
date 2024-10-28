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
    { x: 100, y: 250 }, // Jugador 1
    { x: 700, y: 250 }  // Jugador 2
];

const fieldWidth = 800;
const fieldHeight = 500;

const distance = (x1, y1, x2, y2) => {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
};

const handlePlayerCollision = (player) => {
    // Limitar el movimiento del jugador dentro de la cancha
    if (player.x < 20) {
        player.x = 20; // Limitar a la izquierda
    } else if (player.x > fieldWidth - 20) {
        player.x = fieldWidth - 20; // Limitar a la derecha
    }

    if (player.y < 20) {
        player.y = 20; // Limitar arriba
    } else if (player.y > fieldHeight - 20) {
        player.y = fieldHeight - 20; // Limitar abajo
    }
};

const handleBallCollision = (player, ball) => {
    const dist = distance(player.x, player.y, ball.x, ball.y);
    if (dist < 35) {
        const overlap = 35 - dist; // Calcular el solapamiento
        const dx = (ball.x - player.x) / dist;
        const dy = (ball.y - player.y) / dist;

        // Alejar al jugador de la pelota
        player.x -= dx * overlap;
        player.y -= dy * overlap;

        // Mover la pelota en la dirección del jugador
        const kickStrength = Math.sqrt(player.vx ** 2 + player.vy ** 2) * 0.5; // Fuerza proporcional
        ball.vx += dx * kickStrength;
        ball.vy += dy * kickStrength;
    }
};

const updateBallPosition = () => {
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Colisiones con los bordes del campo
    if (ball.x < ball.radius) {
        ball.x = ball.radius; // Rebotar en el borde izquierdo
        ball.vx = Math.abs(ball.vx); // Asegurarse de que la pelota se mueva hacia la derecha
    } else if (ball.x > fieldWidth - ball.radius) {
        ball.x = fieldWidth - ball.radius; // Rebotar en el borde derecho
        ball.vx = -Math.abs(ball.vx); // Asegurarse de que la pelota se mueva hacia la izquierda
    }

    if (ball.y < ball.radius) {
        ball.y = ball.radius; // Rebotar en el borde superior
        ball.vy = Math.abs(ball.vy); // Asegurarse de que la pelota se mueva hacia abajo
    } else if (ball.y > fieldHeight - ball.radius) {
        ball.y = fieldHeight - ball.radius; // Rebotar en el borde inferior
        ball.vy = -Math.abs(ball.vy); // Asegurarse de que la pelota se mueva hacia arriba
    }

    // Detener la pelota si su velocidad es muy baja
    if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1) {
        ball.vx = 0;
        ball.vy = 0;
    }
};

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado: ' + socket.id);

    let position = predefinedPositions[Object.keys(players).length % predefinedPositions.length];

    players[socket.id] = {
        x: position.x,
        y: position.y,
        color: Object.keys(players).length % 2 === 0 ? 'red' : 'blue',
        canKick: true,
        vx: 0,
        vy: 0
    };

    socket.emit('init', { players, ball });

    socket.on('movement', (movementData) => {
        const player = players[socket.id];

        // Aplicar fricción
        player.vx *= 0.9; // Suaviza el movimiento del jugador
        player.vy *= 0.9; // Suaviza el movimiento del jugador

        const playerSpeed = 0.5;  // Ajusta la velocidad del jugador

        if (movementData.left) player.vx -= playerSpeed;
        if (movementData.up) player.vy -= playerSpeed;
        if (movementData.right) player.vx += playerSpeed;
        if (movementData.down) player.vy += playerSpeed;

        player.x += player.vx;
        player.y += player.vy;

        handlePlayerCollision(player);
        handleBallCollision(player, ball);
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado: ' + socket.id);
        delete players[socket.id];
    });

    setInterval(() => {
        updateBallPosition();

        // Verificar si se marca un gol solo si la pelota está en el arco
        if (ball.x <= 20 && ball.y > (fieldHeight / 2 - 30) && ball.y < (fieldHeight / 2 + 30)) {
            const scoringTeam = 'Rojo';
            io.emit('goal', scoringTeam);
            ball.x = fieldWidth / 2;
            ball.y = fieldHeight / 2;
            ball.vx = 0;
            ball.vy = 0;
        } else if (ball.x >= fieldWidth - 20 && ball.y > (fieldHeight / 2 - 30) && ball.y < (fieldHeight / 2 + 30)) {
            const scoringTeam = 'Azul';
            io.emit('goal', scoringTeam);
            ball.x = fieldWidth / 2;
            ball.y = fieldHeight / 2;
            ball.vx = 0;
            ball.vy = 0;
        }

        io.emit('state', { players, ball });
    }, 1000 / 60); // 60 FPS
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
