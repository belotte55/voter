const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server);

// Config
const PORT = process.env.PORT || 8412;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'games.json');

// Logging helper
const log = (msg, data = {}) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
};

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Trop de requêtes, réessayez plus tard.' },
});
app.use('/game', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Persistence
function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadGames() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const map = new Map();
      Object.entries(data).forEach(([k, v]) => {
        const game = { ...v };
        game.participants = [];
        game.spectators = game.spectators || [];
        game.votes = {};
        game.facilitatorSocketId = null;
        game.revealed = false;
        game.voteTimerEnd = null;
        game.cards = game.cards || ['1', '2', '3', '5', '8', '13', '21', '?'];
        map.set(k, game);
      });
      return map;
    }
  } catch (e) {
    log('Error loading games', { error: e.message });
  }
  return new Map();
}

function saveGames() {
  try {
    ensureDataDir();
    const toSave = {};
    games.forEach((game, id) => {
      if ((game.participants?.length || 0) + (game.spectators?.length || 0) > 0) {
        toSave[id] = {
          ...game,
          participants: game.participants || [],
          spectators: game.spectators || [],
          votes: game.votes || {},
        };
      }
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) {
    log('Error saving games', { error: e.message });
  }
}

const games = loadGames();
const deleteTimers = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', games: games.size });
});

// REST routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/game/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Card presets
const CARD_PRESETS = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21', '?', '☕'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', '?', '☕'],
  fibonacci_extended: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'],
};

function generateGameId() {
  let id;
  do {
    id = Math.random().toString(36).substring(2, 10);
  } while (games.has(id));
  return id;
}

function validateName(name, maxLen = 50) {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= maxLen;
}

function validateIssue(issue) {
  return issue && typeof issue.title === 'string' && issue.title.trim().length > 0 && issue.title.length <= 200;
}

// Socket.io
io.on('connection', (socket) => {
  log('Client connected', { id: socket.id });

  socket.on('create-game', ({ gameName, facilitatorName, issues, cardPreset = 'fibonacci' }) => {
    if (!validateName(gameName, 100) || !validateName(facilitatorName)) {
      socket.emit('error', { message: 'Nom de partie et facilitateur requis (max 100 et 50 car.)' });
      return;
    }
    const gameId = generateGameId();
    const cards = CARD_PRESETS[cardPreset] || CARD_PRESETS.fibonacci;
    const validIssues = (issues || []).filter(validateIssue).map((i) => ({
      id: Date.now() + Math.random(),
      title: String(i.title).trim().substring(0, 200),
      description: String(i.description || '').trim().substring(0, 500),
      estimate: null,
    }));
    const game = {
      id: gameId,
      name: gameName.trim().substring(0, 100),
      facilitator: facilitatorName.trim().substring(0, 50),
      facilitatorSocketId: socket.id,
      cards,
      issues: validIssues,
      currentIssueIndex: 0,
      votes: {},
      revealed: false,
      voteTimerEnd: null,
      participants: [{ id: socket.id, name: facilitatorName.trim(), isFacilitator: true }],
      spectators: [],
    };
    games.set(gameId, game);
    socket.join(gameId);
    socket.gameId = gameId;
    socket.emit('game-created', { gameId, game });
    socket.emit('game-state', game);
    saveGames();
    log('Game created', { gameId, name: game.name });
  });

  socket.on('join-game', ({ gameId, playerName, asSpectator = false }) => {
    if (!asSpectator && !validateName(playerName)) {
      socket.emit('error', { message: 'Nom requis' });
      return;
    }
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Partie introuvable' });
      return;
    }
    const name = (playerName || '').trim().substring(0, 50);
    const existingName = name && game.participants.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!asSpectator && existingName && game.participants.every((p) => p.id !== socket.id)) {
      socket.emit('error', { message: 'Ce nom est déjà utilisé dans cette partie' });
      return;
    }
    const timer = deleteTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      deleteTimers.delete(gameId);
    }
    socket.join(gameId);
    socket.gameId = gameId;
    socket.isSpectator = asSpectator;
    if (asSpectator) {
      game.spectators.push({ id: socket.id, name: name || 'Spectateur' });
    } else {
      const wasEmpty = game.participants.length === 0;
      game.participants.push({ id: socket.id, name: name || 'Anonyme', isFacilitator: false });
      if (wasEmpty) {
        game.facilitatorSocketId = socket.id;
        game.participants[game.participants.length - 1].isFacilitator = true;
      }
    }
    socket.emit('game-joined', { game });
    socket.emit('game-state', game);
    io.to(gameId).emit('participant-joined', game);
    saveGames();
  });

  socket.on('vote', ({ value }) => {
    const gameId = socket.gameId;
    if (!gameId || socket.isSpectator) return;
    const game = games.get(gameId);
    if (!game || game.revealed) return;
    const participant = game.participants.find((p) => p.id === socket.id);
    if (!participant) return;
    const validCard = game.cards.includes(String(value));
    if (!validCard) return;
    game.votes[socket.id] = { value, name: participant.name };
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('reveal-votes', () => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    game.revealed = true;
    game.voteTimerEnd = null;
    const currentIssue = game.issues[game.currentIssueIndex];
    if (currentIssue && Object.keys(game.votes).length > 0) {
      const values = Object.values(game.votes).map((v) => v.value).filter((v) => v !== '?');
      currentIssue.estimate = values.length > 0 ? values[0] : '?';
    }
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('next-issue', () => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    game.currentIssueIndex = Math.min(game.currentIssueIndex + 1, game.issues.length);
    game.votes = {};
    game.revealed = false;
    game.voteTimerEnd = null;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('previous-issue', () => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    game.currentIssueIndex = Math.max(game.currentIssueIndex - 1, 0);
    game.votes = {};
    game.revealed = false;
    game.voteTimerEnd = null;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('go-to-issue', ({ index }) => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    const idx = Math.max(0, Math.min(Number(index), game.issues.length));
    game.currentIssueIndex = idx;
    game.votes = {};
    game.revealed = false;
    game.voteTimerEnd = null;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('reset-votes', () => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    game.votes = {};
    game.revealed = false;
    game.voteTimerEnd = null;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('start-vote-timer', ({ seconds }) => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    const sec = Math.min(300, Math.max(5, Number(seconds) || 60));
    game.voteTimerEnd = Date.now() + sec * 1000;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('add-issue', ({ title, description }) => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    if (!validateIssue({ title })) return;
    game.issues.push({
      id: Date.now() + Math.random(),
      title: String(title).trim().substring(0, 200),
      description: String(description || '').trim().substring(0, 500),
      estimate: null,
    });
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('edit-issue', ({ issueId, title, description }) => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    const issue = game.issues.find((i) => i.id === issueId);
    if (!issue) return;
    if (title !== undefined) issue.title = String(title).trim().substring(0, 200);
    if (description !== undefined) issue.description = String(description || '').trim().substring(0, 500);
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('delete-issue', ({ issueId }) => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game || game.facilitatorSocketId !== socket.id) return;
    const idx = game.issues.findIndex((i) => i.id === issueId);
    if (idx === -1) return;
    game.issues.splice(idx, 1);
    if (game.currentIssueIndex >= game.issues.length) game.currentIssueIndex = Math.max(0, game.issues.length - 1);
    game.votes = {};
    game.revealed = false;
    io.to(gameId).emit('game-state', game);
    saveGames();
  });

  socket.on('disconnect', () => {
    const gameId = socket.gameId;
    if (!gameId) return;
    const game = games.get(gameId);
    if (!game) return;
    game.participants = game.participants.filter((p) => p.id !== socket.id);
    game.spectators = game.spectators.filter((p) => p.id !== socket.id);
    delete game.votes[socket.id];
    if (game.facilitatorSocketId === socket.id && game.participants.length > 0) {
      game.facilitatorSocketId = game.participants[0].id;
      game.participants[0].isFacilitator = true;
    }
    if (game.participants.length === 0 && game.spectators.length === 0) {
      const timer = setTimeout(() => {
        games.delete(gameId);
        deleteTimers.delete(gameId);
        saveGames();
      }, 120000);
      deleteTimers.set(gameId, timer);
    } else {
      io.to(gameId).emit('game-state', game);
      saveGames();
    }
    log('Client disconnected', { id: socket.id, gameId });
  });
});

server.listen(PORT, HOST, () => {
  log(`Planning Poker server running at http://${HOST}:${PORT}`);
});
