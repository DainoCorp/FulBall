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
    // Colisiones con los límites del campo
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

    // Factor de desaceleración cuando la pelota rebota
    const bounceDeceleration = 0.02;  // Factor que controla cuánto se reduce la velocidad al rebotar

    if (ball.x < ball.radius) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx) - bounceDeceleration;  // Reducir la velocidad en el rebote
        if (ball.vx < 0) ball.vx = 0;  // Asegurarse de que no se invierta a una velocidad negativa
    } else if (ball.x > fieldWidth - ball.radius) {
        ball.x = fieldWidth - ball.radius;
        ball.vx = -Math.abs(ball.vx) - bounceDeceleration;  // Reducir la velocidad en el rebote
        if (ball.vx > 0) ball.vx = 0;  // Asegurarse de que no se invierta a una velocidad negativa
    }
    if (ball.y < ball.radius) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy) - bounceDeceleration;  // Reducir la velocidad en el rebote
        if (ball.vy < 0) ball.vy = 0;  // Asegurarse de que no se invierta a una velocidad negativa
    } else if (ball.y > fieldHeight - ball.radius) {
        ball.y = fieldHeight - ball.radius;
        ball.vy = -Math.abs(ball.vy) - bounceDeceleration;  // Reducir la velocidad en el rebote
        if (ball.vy > 0) ball.vy = 0;  // Asegurarse de que no se invierta a una velocidad negativa
    }

    // Detener la pelota si la velocidad es muy baja
    if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1) {
        ball.vx = 0;
        ball.vy = 0;
    }
};

// Modificación de la función resetGame con el contador de gol
let goalCountdown = null; // Variable para el tiempo del contador

const resetGame = (scoringTeam) => {
    // Restablecer posiciones de los jugadores
    Object.keys(players).forEach((id, index) => {
        players[id].x = predefinedPositions[index].x;
        players[id].y = predefinedPositions[index].y;
        players[id].canMove = false;  // Deshabilitar movimiento durante el contador
    });

    // Colocar la pelota en el lado contrario al que anotó
    const centerX = fieldWidth / 2;
    const centerY = fieldHeight / 2;
    const ballOffset = 150; // Ajusta esta distancia si quieres que la pelota esté más cerca o más lejos del centro

    if (scoringTeam === 1) {
        ball.x = centerX - ballOffset; // A la izquierda del campo
        ball.y = centerY; // Centrada verticalmente
    } else {
        ball.x = centerX + ballOffset; // A la derecha del campo
        ball.y = centerY; // Centrada verticalmente
    }

    // Iniciar el contador de 5 segundos (por ejemplo)
    goalCountdown = 5;
    
    // Actualizar el fondo a borroso
    io.emit('setBlur', true);
    
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
        restricted: false,  // Estado para controlar la "pared invisible"
        vx: 0,
        vy: 0,
        id: socket.id,
        name: `Jugador ${Object.keys(players).length}`, // Nombre del jugador
        charge: 0,  // Potencia de carga inicial
    };

    socket.emit('init', { players, ball });

    socket.on('movement', (movementData) => {
        const player = players[socket.id];
        
        // Si el contador está en marcha, no permitir movimiento
        if (!player.canMove || goalCountdown > 0) return;

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

    // Manejo de la carga de la potencia del tiro con la barra espaciadora
    socket.on('chargePower', () => {
        const player = players[socket.id];

        // Limitar la carga de potencia
        if (player.charge < 100) {
            player.charge += 0.5;  // Aumenta la carga mientras se mantiene la tecla
        }
    });

    // Disparo de la pelota con la potencia cargada
    socket.on('shoot', () => {
        const player = players[socket.id];

        if (player.charge > 0) {
            // Direccionamos la pelota con la carga
            const dx = ball.x - player.x;
            const dy = ball.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const unitX = dx / distance;
            const unitY = dy / distance;

            // Aplicamos la potencia al tiro
            ball.vx = unitX * player.charge * 0.1;
            ball.vy = unitY * player.charge * 0.1;

            player.charge = 0;  // Restablecer la carga después de disparar
        }
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

        // Contador de tiempo
        if (goalCountdown > 0) {
            goalCountdown -= 1 / 60;  // Decrementar el contador cada frame (60 FPS)
            io.emit('countdown', Math.floor(goalCountdown));  // Enviar el tiempo restante a los jugadores
        } else if (goalCountdown <= 0) {
            // Rehabilitar el movimiento y quitar la borrosidad al llegar a 0
            Object.keys(players).forEach((id) => {
                players[id].canMove = true;  // Habilitar movimiento
            });
            io.emit('setBlur', false);  // Quitar el fondo borroso
        }

        io.emit('state', { players, ball });
    }, 1000 / 60);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
