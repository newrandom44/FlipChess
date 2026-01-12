const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(__dirname));

const rooms = {};

const FRUITS = [
    '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
    '🍓', '🍒', '🍑', '🍍', '🥝', '🍅', '🍆', '🌽',
    '🥕', '🥔', '🥒', '🍄', '🍞', '🥐', '🥨', '🧀',
    '🍦', '🍰', '🍪', '🍩', '🍬', '🍭', '🍮', '🍯'
];

function generateBoard() {
    const tokens = [...FRUITS, ...FRUITS];
    return tokens.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            players: [socket.id],
            board: generateBoard(),
            scores: [0, 0],
            currentPlayer: 0,
            matchesFound: 0,
            matchesFound: 0,
            flippedTokens: [], // Indices of currently flipped tokens
            matchedTokens: new Set() // Indices of permanently matched tokens
        };
        socket.join(roomId);
        socket.emit('room_created', roomId);
        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomId);

            // Assign Player 2 (the joiner)
            socket.emit('player_assignment', 1);

            // Notify both players to start (without overwriting IDs)
            io.to(roomId).emit('game_start', {
                board: room.board,
                roomId: roomId
            });

            console.log(`User ${socket.id} joined room ${roomId}`);
        } else {
            socket.emit('error_message', 'Sala no encontrada o llena');
        }
    });

    socket.on('flip_token', ({ roomId, tokenIndex }) => {
        const room = rooms[roomId];
        if (!room) return;

        // 1. Validate if it's this player's turn
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex !== room.currentPlayer) {
            return;
        }

        // 2. Validate if token is already Matched or Flipped
        if (room.matchedTokens.has(tokenIndex)) return;
        if (room.flippedTokens.includes(tokenIndex)) return;

        // 3. Validate if we are ALREADY processing a match check (locked state)
        if (room.flippedTokens.length >= 2) return;

        // Broadcast flip to everyone in room
        io.to(roomId).emit('token_flipped', tokenIndex);

        room.flippedTokens.push(tokenIndex);

        if (room.flippedTokens.length === 2) {
            // Lock further inputs implicitly by having 2 flipped tokens
            room.checkTimeout = setTimeout(() => {
                checkMatch(roomId);
            }, 800); // Wait for animation on clients
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Better handling: notify other player if mostly full
    });
});

function checkMatch(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const [idx1, idx2] = room.flippedTokens;
    const val1 = room.board[idx1];
    const val2 = room.board[idx2];

    if (val1 === val2) {
        // Match!
        room.scores[room.currentPlayer]++;
        room.matchesFound++;

        // Mark as permanently matched
        room.matchedTokens.add(idx1);
        room.matchedTokens.add(idx2);

        room.flippedTokens = [];

        io.to(roomId).emit('match_found', {
            indices: [idx1, idx2],
            scores: room.scores,
            matchesFound: room.matchesFound
        });

        if (room.matchesFound === 32) {
            io.to(roomId).emit('game_over', { scores: room.scores });
        }
    } else {
        // No match
        room.flippedTokens = [];
        room.currentPlayer = room.currentPlayer === 0 ? 1 : 0;

        io.to(roomId).emit('no_match', {
            indices: [idx1, idx2],
            nextPlayer: room.currentPlayer
        });
    }
}

server.listen(3000, () => {
    console.log('Server running on *:3000');
});
