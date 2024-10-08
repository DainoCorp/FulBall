const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware para servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const ball = { x: 400, y: 350, vx: 0, vy: 0, radius: 15 };

const predefinedPositions = [
    { x: 100, y: 350 }, // Jugador 1
    { x: 900, y: 350 }  // Jugador 2
];

const fieldWidth = 1000;
const fieldHeight = 700;

const distance = (x1, y1, x2, y2) => {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
};

const handleCollision = (player1, player2) => {
    const dist = distance(player1.x, player1.y, player2.x, player2.y);
    if (dist < 40) {
        const overlap = 40 - dist;
        const dx = (player2.x - player1.x) / dist;
        const dy = (player2.y - player1.y) / dist;

        player1.x -= dx * overlap / 2;
        player1.y -= dy * overlap / 2;

        player2.x += dx * overlap / 2;
        player2.y += dy * overlap / 2;
    }
};

const handleBallCollision = (player, ball) => {
    const dist = distance(player.x, player.y, ball.x, ball.y);
    if (dist < 35) {
        const overlap = 35 - dist;
        const dx = (ball.x - player.x) / dist;
        const dy = (ball.y - player.y) / dist;

        // Alejar al jugador de la pelota
        player.x -= dx * overlap;
        player.y -= dy * overlap;

        // Aplicar movimiento limitado a la pelota
        const forceMultiplier = 0.5; // Ajusta esto para cambiar cuánto se mueve la pelota
        ball.vx += dx * overlap * forceMultiplier;
        ball.vy += dy * overlap * forceMultiplier;
    }
};

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado: ' + socket.id);

    let position;

    // Asignar posición específica al nuevo jugador
    if (Object.keys(players).length < predefinedPositions.length) {
        position = predefinedPositions[Object.keys(players).length];
    } else {
        position = {
            x: Math.random() < 0.5 ? 100 : 900, // Alterna entre las posiciones
            y: Math.random() * 700
        };
    }

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

        // Aplicar fricción para el efecto de patinaje
        player.vx *= 0.95;
        player.vy *= 0.95;

        const playerSpeed = 0.5;  // Velocidad del jugador

        if (movementData.left) player.vx -= playerSpeed;
        if (movementData.up) player.vy -= playerSpeed;
        if (movementData.right) player.vx += playerSpeed;
        if (movementData.down) player.vy += playerSpeed;

        player.x += player.vx;
        player.y += player.vy;

        // Limitar jugadores dentro del campo
        if (player.x < 50) player.x = 50;
        if (player.x > fieldWidth - 50) player.x = fieldWidth - 50;
        if (player.y < 50) player.y = 50;
        if (player.y > fieldHeight - 50) player.y = fieldHeight - 50;

        // Verificar colisiones con otros jugadores
        for (let id in players) {
            if (id !== socket.id) {
                handleCollision(player, players[id]);
            }
        }

        // Verificar colisión con la pelota
        handleBallCollision(player, ball);

        // Verificar si el jugador está cerca de la pelota
        const distToBall = distance(player.x, player.y, ball.x, ball.y);
        if (distToBall < 40 && movementData.kick) {
            // Calcular la dirección de la patada
            ball.vx += (ball.x - player.x) / distToBall * 2; // Cambiar 5 por 2 para mover menos la pelota
            ball.vy += (ball.y - player.y) / distToBall * 2; // Cambiar 5 por 2 para mover menos la pelota
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado: ' + socket.id);
        delete players[socket.id];
    });

    // Enviar estado del juego a todos los clientes
    setInterval(() => {
        // Actualizar la posición de la pelota
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Aplicar fricción a la pelota
        ball.vx *= 0.99; // Disminuir velocidad de la pelota gradualmente
        ball.vy *= 0.99; // Disminuir velocidad de la pelota gradualmente

        // Colisiones con los bordes del campo
        if (ball.x < 35 || ball.x > fieldWidth - 35) {
            ball.vx *= -1; // Rebotar en los bordes
        }
        if (ball.y < 35 || ball.y > fieldHeight - 35) {
            ball.vy *= -1; // Rebotar en los bordes
        }

        // Detener la pelota si su velocidad es demasiado baja
        const speedThreshold = 0.1; // Ajusta este valor según sea necesario
        if (Math.abs(ball.vx) < speedThreshold) {
            ball.vx = 0;
        }
        if (Math.abs(ball.vy) < speedThreshold) {
            ball.vy = 0;
        }

        io.emit('state', { players, ball });
    }, 1000 / 60); // 60 FPS
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
