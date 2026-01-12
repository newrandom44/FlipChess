const FRUITS = [
    '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
    '🍓', '🍒', '🍑', '🍍', '🥝', '🍅', '🍆', '🌽',
    '🥕', '🥔', '🥒', '🍄', '🍞', '🥐', '🥨', '🧀',
    '🍦', '🍰', '🍪', '🍩', '🍬', '🍭', '🍮', '🍯'
];

class Game {
    constructor() {
        this.board = document.getElementById('game-board');
        this.p1ScoreEl = document.getElementById('p1-score');
        this.p2ScoreEl = document.getElementById('p2-score');
        this.p1Card = document.getElementById('p1-card');
        this.p2Card = document.getElementById('p2-card');
        this.statusEl = document.getElementById('status-message');
        this.btnShuffle = document.getElementById('btn-shuffle');
        this.btnStart = document.getElementById('btn-start');

        // Lobby elements
        this.lobbyOverlay = document.getElementById('lobby-overlay');
        this.btnCreateRoom = document.getElementById('btn-create-room');
        this.btnJoinRoom = document.getElementById('btn-join-room');
        this.roomInput = document.getElementById('room-code-input');
        this.btnLocalPlay = document.getElementById('btn-local-play');

        this.scores = [0, 0];
        this.currentPlayer = 0;
        this.flippedTokens = [];
        this.locked = true;
        this.gameStarted = false;
        this.matchesFound = 0;
        this.totalPairs = 32;
        this.tokens = [];

        this.isOnline = false;
        this.playerId = 0; // 0 or 1
        this.roomId = null;
        this.socket = null;

        this.initLobby();
        this.initControls();
    }

    initLobby() {
        // Local Play
        this.btnLocalPlay.addEventListener('click', () => {
            this.isOnline = false;
            this.lobbyOverlay.style.display = 'none';
            this.initLocalGame();
        });

        // Online Play
        if (typeof io !== 'undefined') {
            this.socket = io();

            this.btnCreateRoom.addEventListener('click', () => {
                this.socket.emit('create_room');
            });

            this.btnJoinRoom.addEventListener('click', () => {
                const code = this.roomInput.value.toUpperCase();
                if (code.length === 5) {
                    this.socket.emit('join_room', code);
                }
            });

            this.initSocketEvents();
        }
    }

    initSocketEvents() {
        this.socket.on('room_created', (roomId) => {
            this.roomId = roomId;
            this.playerId = 0; // Creator is always P1
            this.statusEl.textContent = `Esperando oponente... Código: ${roomId}`;
            this.lobbyOverlay.style.display = 'none';
            // Hide local controls
            this.btnShuffle.style.display = 'none';
            this.btnStart.style.display = 'none';
        });

        this.socket.on('game_start', (data) => {
            this.roomId = data.roomId;
            this.tokens = data.board;
            this.isOnline = true;
            this.lobbyOverlay.style.display = 'none';

            this.renderBoard();
            this.startGameOnline();
        });

        this.socket.on('player_assignment', (id) => {
            this.playerId = id;
        });

        this.socket.on('error_message', (msg) => {
            alert(msg);
        });

        this.socket.on('token_flipped', (index) => {
            const container = document.querySelector(`.token-container[data-index="${index}"]`);
            if (container) {
                const token = container.querySelector('.token');
                token.classList.add('flipped');
            }
        });

        this.socket.on('match_found', (data) => {
            const { indices, scores, matchesFound } = data;

            this.scores = scores;
            this.matchesFound = matchesFound;
            this.updateUI();

            indices.forEach(idx => {
                const el = document.querySelector(`.token-container[data-index="${idx}"]`);
                if (el) el.classList.add('matched');
            });

            if (this.matchesFound === this.totalPairs) {
                this.endGame();
            }
        });

        this.socket.on('no_match', (data) => {
            const { indices, nextPlayer } = data;

            indices.forEach(idx => {
                const el = document.querySelector(`.token-container[data-index="${idx}"]`);
                if (el) el.querySelector('.token').classList.remove('flipped');
            });

            this.currentPlayer = nextPlayer;
            this.updateUI();
        });

        this.socket.on('game_over', (data) => {
            this.scores = data.scores;
            // Delay slightly to ensure match animation finishes
            setTimeout(() => {
                this.endGame();
            }, 1000);
        });
    }

    initLocalGame() {
        this.tokens = [...FRUITS, ...FRUITS];
        this.shuffle();
        this.renderBoard();
        this.statusEl.textContent = 'Baraja las fichas y pulsa EMPEZAR';
    }

    initControls() {
        this.btnShuffle.addEventListener('click', () => {
            if (this.gameStarted || this.isOnline) return;
            this.shuffle();
            this.renderBoard();
            this.statusEl.textContent = '¡Fichas barajadas!';
        });

        this.btnStart.addEventListener('click', () => {
            if (this.isOnline) return;
            this.startGame();
        });
    }

    shuffle() {
        this.tokens.sort(() => Math.random() - 0.5);
    }

    renderBoard() {
        this.board.innerHTML = '';
        // Exact 64 hex grid: 4, 5, 6, 7, 8, 9, 8, 7, 6, 4
        const rowConfig = [4, 5, 6, 7, 8, 9, 8, 7, 6, 4];
        let tokenIdx = 0;

        rowConfig.forEach(count => {
            const row = document.createElement('div');
            row.className = 'hex-row';

            for (let i = 0; i < count; i++) {
                if (tokenIdx >= 64) break;

                const fruit = this.tokens[tokenIdx];
                const container = document.createElement('div');
                container.className = 'token-container';
                container.dataset.index = tokenIdx;
                container.dataset.fruit = fruit;

                // Always start face-down (no 'flipped' class)
                container.innerHTML = `
                    <div class="token">
                        <div class="token-face token-back"></div>
                        <div class="token-face token-front">${fruit}</div>
                    </div>
                `;

                const currentIndex = tokenIdx;
                container.addEventListener('click', () => this.handleTokenClick(container, currentIndex));
                row.appendChild(container);
                tokenIdx++;
            }
            this.board.appendChild(row);
        });
    }

    startGame() {
        if (this.gameStarted) return;

        // Reset logic for local new game
        if (this.matchesFound === this.totalPairs) {
            this.scores = [0, 0];
            this.currentPlayer = 0;
            this.matchesFound = 0;
            this.flippedTokens = [];
            this.updateUI();
            this.renderBoard();
        }

        this.gameStarted = true;
        this.locked = false;

        this.btnShuffle.style.opacity = '0.5';
        this.btnShuffle.style.cursor = 'default';
        this.btnStart.style.display = 'none';

        this.statusEl.textContent = '¡Partida iniciada! Turno de: Jugador 1';
    }

    startGameOnline() {
        this.gameStarted = true;
        this.locked = false;

        // Disable local buttons
        this.btnShuffle.style.display = 'none';
        this.btnStart.style.display = 'none';

        this.statusEl.textContent = '¡Partida Online! Turno de: Jugador 1';
        this.updateUI();
    }

    handleTokenClick(container, index) {
        // Block if locked or game not started
        if (this.locked || !this.gameStarted) return;

        // ONLINE LOGIC
        if (this.isOnline) {
            // Only allow click if it's MY turn
            if (this.currentPlayer !== this.playerId) return;

            if (container.classList.contains('matched')) return;
            const token = container.querySelector('.token');
            if (token.classList.contains('flipped')) return;

            // Optimistic flip (visual instant feedback) but server decides logic
            // Actually, wait for server to confirm to avoid de-sync
            this.socket.emit('flip_token', { roomId: this.roomId, tokenIndex: index });
            return;
        }

        // LOCAL LOGIC
        if (container.classList.contains('matched')) return;
        const token = container.querySelector('.token');
        if (token.classList.contains('flipped')) return;

        token.classList.add('flipped');
        this.flippedTokens.push(container);

        if (this.flippedTokens.length === 2) {
            this.checkMatch();
        }
    }

    checkMatch() {
        this.locked = true;
        const [t1, t2] = this.flippedTokens;
        const fruit1 = t1.dataset.fruit;
        const fruit2 = t2.dataset.fruit;

        if (fruit1 === fruit2) {
            setTimeout(() => {
                t1.classList.add('matched');
                t2.classList.add('matched');

                this.scores[this.currentPlayer]++;
                this.updateUI();

                this.matchesFound++;
                this.flippedTokens = [];
                this.locked = false;

                if (this.matchesFound === this.totalPairs) {
                    this.endGame();
                }
            }, 600);
        } else {
            setTimeout(() => {
                t1.querySelector('.token').classList.remove('flipped');
                t2.querySelector('.token').classList.remove('flipped');
                this.flippedTokens = [];
                this.switchPlayer();
                this.locked = false;
            }, 1000);
        }
    }

    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;
        this.updateUI();
    }

    updateUI() {
        this.p1ScoreEl.textContent = this.scores[0];
        this.p2ScoreEl.textContent = this.scores[1];

        let turnText = this.currentPlayer === 0 ? 'Jugador 1' : 'Jugador 2';

        if (this.isOnline) {
            if (this.currentPlayer === this.playerId) {
                turnText = 'TU TURNO';
                this.statusEl.style.color = '#4caf50';
            } else {
                turnText = 'Turno del Oponente';
                this.statusEl.style.color = '#fff';
            }
        }

        if (this.currentPlayer === 0) {
            this.p1Card.classList.add('active');
            this.p2Card.classList.remove('active');
        } else {
            this.p2Card.classList.add('active');
            this.p1Card.classList.remove('active');
        }

        this.statusEl.textContent = turnText;
    }

    endGame() {
        let winner;
        if (this.scores[0] > this.scores[1]) winner = 'Jugador 1';
        else if (this.scores[1] > this.scores[0]) winner = 'Jugador 2';
        else winner = 'Empate';

        if (this.isOnline) {
            if ((this.scores[this.playerId] > this.scores[1 - this.playerId])) {
                winner = '¡HAS GANADO!';
            } else if (this.scores[this.playerId] < this.scores[1 - this.playerId]) {
                winner = 'Has perdido...';
            }
        }

        this.statusEl.innerHTML = `<div>🏁 ${winner}</div>`;

        const btnReset = document.createElement('button');
        btnReset.textContent = '🏠 VOLVER AL MENÚ';
        btnReset.style.marginTop = '15px';
        btnReset.style.padding = '10px 20px';
        btnReset.style.fontSize = '1rem';
        btnReset.style.cursor = 'pointer';
        btnReset.style.background = '#2196F3';
        btnReset.style.border = 'none';
        btnReset.style.borderRadius = '5px';
        btnReset.style.color = 'white';

        btnReset.addEventListener('click', () => {
            window.location.reload();
        });

        this.statusEl.appendChild(btnReset);

        if (!this.isOnline) {
            // Clean up for local play if needed, but reload is easiest
        }

        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
