# Alias Game Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multiplayer Alias word-guessing game for 2 teams of 2 players, each on their own device, synced via WebSocket.

**Architecture:** Layered Node.js server (handlers → state + rules) with Socket.io for real-time sync. Vanilla SPA frontend, mobile-first. Words loaded from JSON files by category.

**Tech Stack:** Node.js, Express, Socket.io, Vitest (tests), Vanilla HTML/CSS/JS

---

### Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Step 1: Initialize git repo**

Run: `git init`
Expected: Initialized empty Git repository

**Step 2: Create package.json**

```json
{
  "name": "game-alias",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.21.0",
    "socket.io": "^4.7.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

**Step 3: Create .gitignore**

```
node_modules/
.DS_Store
```

**Step 4: Install dependencies**

Run: `npm install`
Expected: added N packages

**Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: init project with express, socket.io, vitest"
```

---

### Task 2: Word Dictionary — `server/words.js`

**Files:**
- Create: `server/words/general.json`
- Create: `server/words.js`
- Create: `tests/words.test.js`

**Step 1: Create starter dictionary**

Create `server/words/general.json` — flat array of 300+ Russian nouns. Mix of easy/medium difficulty. Example structure:

```json
["кошка", "самолёт", "библиотека", "робот", "вулкан", "шоколад", ...]
```

Full list: common Russian nouns covering categories like animals, food, technology, nature, professions, sports, household items. No proper nouns, no obscure words.

**Step 2: Write failing test**

Create `tests/words.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { loadCategories, createWordPool } from '../server/words.js';

describe('words', () => {
  describe('loadCategories', () => {
    it('returns available category names from words directory', () => {
      const categories = loadCategories();
      expect(categories).toContain('general');
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('createWordPool', () => {
    let pool;

    beforeEach(() => {
      pool = createWordPool(['general']);
    });

    it('returns a pool with nextWord function', () => {
      expect(typeof pool.nextWord).toBe('function');
    });

    it('returns a string word', () => {
      const word = pool.nextWord();
      expect(typeof word).toBe('string');
      expect(word.length).toBeGreaterThan(0);
    });

    it('does not repeat words', () => {
      const seen = new Set();
      for (let i = 0; i < 50; i++) {
        const word = pool.nextWord();
        expect(seen.has(word)).toBe(false);
        seen.add(word);
      }
    });

    it('shuffles words (not alphabetical order)', () => {
      const pool1 = createWordPool(['general']);
      const pool2 = createWordPool(['general']);
      const words1 = Array.from({ length: 10 }, () => pool1.nextWord());
      const words2 = Array.from({ length: 10 }, () => pool2.nextWord());
      // Extremely unlikely to get same order twice
      expect(words1).not.toEqual(words2);
    });
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/words.test.js`
Expected: FAIL — cannot find module `../server/words.js`

**Step 4: Implement words.js**

Create `server/words.js`:

```js
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORDS_DIR = join(__dirname, 'words');

export function loadCategories() {
  return readdirSync(WORDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

export function createWordPool(categories) {
  let words = [];
  for (const cat of categories) {
    const filePath = join(WORDS_DIR, `${cat}.json`);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    words.push(...data);
  }

  // Fisher-Yates shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  let index = 0;

  return {
    nextWord() {
      if (index >= words.length) {
        // Reshuffle when exhausted
        for (let i = words.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [words[i], words[j]] = [words[j], words[i]];
        }
        index = 0;
      }
      return words[index++];
    }
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/words.test.js`
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add server/words.js server/words/ tests/words.test.js
git commit -m "feat: add word dictionary with categories and shuffle"
```

---

### Task 3: Game State — `server/state.js`

**Files:**
- Create: `server/state.js`
- Create: `tests/state.test.js`

**Step 1: Write failing tests**

Create `tests/state.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom, getRoom, addPlayer, removePlayer,
  setPlayerTeam, startGame, nextTurn, addScore,
  getRoomByCode
} from '../server/state.js';

describe('state', () => {
  let roomId;

  beforeEach(() => {
    roomId = createRoom({
      hostId: 'host-1',
      categories: ['general'],
      targetScore: 50,
      roundTime: 60
    });
  });

  describe('createRoom', () => {
    it('returns a 4-digit string code', () => {
      expect(roomId).toMatch(/^\d{4}$/);
    });

    it('creates room retrievable by code', () => {
      const room = getRoomByCode(roomId);
      expect(room).toBeDefined();
      expect(room.settings.targetScore).toBe(50);
    });
  });

  describe('addPlayer', () => {
    it('adds player to room', () => {
      addPlayer(roomId, { id: 'p1', name: 'Alice' });
      const room = getRoomByCode(roomId);
      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe('Alice');
    });

    it('rejects 5th player', () => {
      addPlayer(roomId, { id: 'p1', name: 'A' });
      addPlayer(roomId, { id: 'p2', name: 'B' });
      addPlayer(roomId, { id: 'p3', name: 'C' });
      addPlayer(roomId, { id: 'p4', name: 'D' });
      expect(() => addPlayer(roomId, { id: 'p5', name: 'E' }))
        .toThrow('Room is full');
    });
  });

  describe('setPlayerTeam', () => {
    it('assigns player to team 1 or 2', () => {
      addPlayer(roomId, { id: 'p1', name: 'Alice' });
      setPlayerTeam(roomId, 'p1', 1);
      const room = getRoomByCode(roomId);
      expect(room.players[0].team).toBe(1);
    });
  });

  describe('startGame', () => {
    it('sets game phase to playing', () => {
      addPlayer(roomId, { id: 'p1', name: 'A' });
      addPlayer(roomId, { id: 'p2', name: 'B' });
      addPlayer(roomId, { id: 'p3', name: 'C' });
      addPlayer(roomId, { id: 'p4', name: 'D' });
      setPlayerTeam(roomId, 'p1', 1);
      setPlayerTeam(roomId, 'p2', 1);
      setPlayerTeam(roomId, 'p3', 2);
      setPlayerTeam(roomId, 'p4', 2);
      const turnInfo = startGame(roomId);
      const room = getRoomByCode(roomId);
      expect(room.phase).toBe('playing');
      expect(turnInfo.explainerId).toBeDefined();
      expect(turnInfo.guesserId).toBeDefined();
      expect(turnInfo.team).toBe(1);
    });
  });

  describe('addScore / nextTurn', () => {
    beforeEach(() => {
      addPlayer(roomId, { id: 'p1', name: 'A' });
      addPlayer(roomId, { id: 'p2', name: 'B' });
      addPlayer(roomId, { id: 'p3', name: 'C' });
      addPlayer(roomId, { id: 'p4', name: 'D' });
      setPlayerTeam(roomId, 'p1', 1);
      setPlayerTeam(roomId, 'p2', 1);
      setPlayerTeam(roomId, 'p3', 2);
      setPlayerTeam(roomId, 'p4', 2);
      startGame(roomId);
    });

    it('adds points to current team', () => {
      addScore(roomId, 1, 5);
      const room = getRoomByCode(roomId);
      expect(room.scores[1]).toBe(5);
    });

    it('switches team on nextTurn', () => {
      const turn1 = getRoomByCode(roomId).currentTurn;
      nextTurn(roomId);
      const turn2 = getRoomByCode(roomId).currentTurn;
      expect(turn2.team).not.toBe(turn1.team);
    });

    it('swaps explainer/guesser within team on second turn', () => {
      const firstExplainer = getRoomByCode(roomId).currentTurn.explainerId;
      nextTurn(roomId); // team 2 plays
      nextTurn(roomId); // back to team 1
      const newExplainer = getRoomByCode(roomId).currentTurn.explainerId;
      expect(newExplainer).not.toBe(firstExplainer);
    });
  });

  describe('removePlayer', () => {
    it('removes player from room', () => {
      addPlayer(roomId, { id: 'p1', name: 'Alice' });
      removePlayer(roomId, 'p1');
      const room = getRoomByCode(roomId);
      expect(room.players).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/state.test.js`
Expected: FAIL — cannot find module

**Step 3: Implement state.js**

Create `server/state.js` — in-memory Map of rooms. Each room:

```js
const rooms = new Map();

export function createRoom({ hostId, categories, targetScore, roundTime }) {
  const code = generateCode();
  rooms.set(code, {
    code,
    hostId,
    settings: { categories, targetScore, roundTime },
    players: [],
    scores: { 1: 0, 2: 0 },
    phase: 'lobby', // lobby | playing | finished
    currentTurn: null,
    turnIndex: 0
  });
  return code;
}

// generateCode: random 4-digit, retry if collision
// addPlayer: push to players[], throw if >= 4
// setPlayerTeam: find player, set .team
// startGame: validate 2+2, set phase='playing', set currentTurn with team 1
// nextTurn: toggle team, increment turnIndex, compute explainer/guesser based on turnIndex
// addScore: scores[team] += points
// removePlayer: filter out by id
// getRoomByCode: rooms.get(code)
// getRoom: alias
```

Key logic for role rotation: for each team, explainer index = `Math.floor(turnIndex / 2) % 2` — alternates every time that team plays.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/state.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/state.js tests/state.test.js
git commit -m "feat: add game state management with rooms, players, turns"
```

---

### Task 4: Game Rules — `server/rules.js`

**Files:**
- Create: `server/rules.js`
- Create: `tests/rules.test.js`

**Step 1: Write failing tests**

Create `tests/rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { canStartGame, processGuess, processSkip, checkWin } from '../server/rules.js';

describe('rules', () => {
  describe('canStartGame', () => {
    it('returns true when 2+2 teams', () => {
      const room = {
        players: [
          { id: 'p1', team: 1 }, { id: 'p2', team: 1 },
          { id: 'p3', team: 2 }, { id: 'p4', team: 2 }
        ]
      };
      expect(canStartGame(room)).toBe(true);
    });

    it('returns false when teams unbalanced', () => {
      const room = {
        players: [
          { id: 'p1', team: 1 }, { id: 'p2', team: 1 },
          { id: 'p3', team: 1 }, { id: 'p4', team: 2 }
        ]
      };
      expect(canStartGame(room)).toBe(false);
    });

    it('returns false when less than 4 players', () => {
      const room = {
        players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }]
      };
      expect(canStartGame(room)).toBe(false);
    });
  });

  describe('processGuess', () => {
    it('returns +1 score', () => {
      expect(processGuess()).toEqual({ delta: 1, result: 'guessed' });
    });
  });

  describe('processSkip', () => {
    it('returns -1 penalty', () => {
      expect(processSkip()).toEqual({ delta: -1, result: 'skipped' });
    });
  });

  describe('checkWin', () => {
    it('returns winning team when score >= target', () => {
      expect(checkWin({ 1: 50, 2: 30 }, 50)).toBe(1);
    });

    it('returns null when no team reached target', () => {
      expect(checkWin({ 1: 30, 2: 30 }, 50)).toBe(null);
    });

    it('returns first team in order if both reach target', () => {
      expect(checkWin({ 1: 55, 2: 60 }, 50)).toBe(1);
    });

    it('does not allow negative scores to go below 0', () => {
      // Scores can go negative via skips - that's ok per rules
      expect(checkWin({ 1: -3, 2: 10 }, 50)).toBe(null);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/rules.test.js`
Expected: FAIL

**Step 3: Implement rules.js**

```js
export function canStartGame(room) {
  if (room.players.length !== 4) return false;
  const team1 = room.players.filter(p => p.team === 1).length;
  const team2 = room.players.filter(p => p.team === 2).length;
  return team1 === 2 && team2 === 2;
}

export function processGuess() {
  return { delta: 1, result: 'guessed' };
}

export function processSkip() {
  return { delta: -1, result: 'skipped' };
}

export function checkWin(scores, targetScore) {
  if (scores[1] >= targetScore) return 1;
  if (scores[2] >= targetScore) return 2;
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rules.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/rules.js tests/rules.test.js
git commit -m "feat: add game rules — scoring, penalties, win condition"
```

---

### Task 5: Express + Socket.io Server — `server/index.js`

**Files:**
- Create: `server/index.js`

**Step 1: Implement minimal server**

```js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerHandlers } from './handlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Alias game running on http://localhost:${PORT}`);
});
```

**Step 2: Create placeholder handlers.js**

```js
export function registerHandlers(io, socket) {
  // Will be implemented in Task 6
  console.log(`Player connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
}
```

**Step 3: Verify server starts**

Run: `node server/index.js &` then `curl -s http://localhost:3000 | head -1` then kill the process.
Expected: Server starts without errors.

**Step 4: Commit**

```bash
git add server/index.js server/handlers.js
git commit -m "feat: add express + socket.io server bootstrap"
```

---

### Task 6: Socket.io Handlers — `server/handlers.js`

**Files:**
- Modify: `server/handlers.js`

**Step 1: Implement all event handlers**

`server/handlers.js` — the full handlers implementation. This is the integration layer connecting Socket.io events to state.js and rules.js:

```js
import { createRoom, getRoomByCode, addPlayer, removePlayer, setPlayerTeam, startGame, nextTurn, addScore } from './state.js';
import { canStartGame, processGuess, processSkip, checkWin } from './rules.js';
import { loadCategories, createWordPool } from './words.js';

const roomTimers = new Map();   // code -> intervalId
const roomWordPools = new Map(); // code -> wordPool
const playerRooms = new Map();   // socketId -> roomCode

export function registerHandlers(io, socket) {

  socket.on('get-categories', (callback) => {
    callback(loadCategories());
  });

  socket.on('create-room', ({ categories, targetScore, roundTime }) => {
    const code = createRoom({
      hostId: socket.id,
      categories,
      targetScore,
      roundTime
    });
    roomWordPools.set(code, createWordPool(categories));
    playerRooms.set(socket.id, code);
    socket.join(code);
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code, playerName }) => {
    const room = getRoomByCode(code);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    try {
      addPlayer(code, { id: socket.id, name: playerName });
    } catch (e) {
      return socket.emit('error', { message: e.message });
    }
    playerRooms.set(socket.id, code);
    socket.join(code);
    const updated = getRoomByCode(code);
    io.to(code).emit('player-joined', {
      players: updated.players,
    });
  });

  socket.on('switch-team', ({ playerId, team }) => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.hostId !== socket.id) return;
    setPlayerTeam(code, playerId, team);
    io.to(code).emit('player-joined', {
      players: getRoomByCode(code).players,
    });
  });

  socket.on('start-game', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.hostId !== socket.id) return;
    if (!canStartGame(room)) return socket.emit('error', { message: 'Need 2+2 teams' });

    const turnInfo = startGame(code);
    io.to(code).emit('game-started', turnInfo);
    sendWord(code, turnInfo.explainerId);
    startTimer(io, code);
  });

  socket.on('guess', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.phase !== 'playing') return;
    if (room.currentTurn.guesserId !== socket.id) return;

    const { delta, result } = processGuess();
    addScore(code, room.currentTurn.team, delta);
    const updated = getRoomByCode(code);

    io.to(code).emit('word-result', { result, scores: updated.scores });

    const winner = checkWin(updated.scores, updated.settings.targetScore);
    if (winner) return endGame(io, code, winner);

    sendWord(code, room.currentTurn.explainerId);
  });

  socket.on('skip', () => {
    const code = playerRooms.get(socket.id);
    const room = getRoomByCode(code);
    if (room.phase !== 'playing') return;
    if (room.currentTurn.guesserId !== socket.id) return;

    const { delta, result } = processSkip();
    addScore(code, room.currentTurn.team, delta);
    const updated = getRoomByCode(code);

    io.to(code).emit('word-result', { result, scores: updated.scores });
    sendWord(code, room.currentTurn.explainerId);
  });

  socket.on('disconnect', () => {
    const code = playerRooms.get(socket.id);
    if (!code) return;
    playerRooms.delete(socket.id);
    removePlayer(code, socket.id);
    const room = getRoomByCode(code);
    if (room) {
      io.to(code).emit('player-joined', { players: room.players });
    }
  });

  function sendWord(code, explainerId) {
    const pool = roomWordPools.get(code);
    const word = pool.nextWord();
    io.to(explainerId).emit('new-word', { word });
  }

  function startTimer(io, code) {
    const room = getRoomByCode(code);
    let seconds = room.settings.roundTime;
    const interval = setInterval(() => {
      seconds--;
      io.to(code).emit('tick', { secondsLeft: seconds });
      if (seconds <= 0) {
        clearInterval(interval);
        roomTimers.delete(code);
        const current = getRoomByCode(code);
        io.to(code).emit('turn-end', {
          scores: current.scores
        });
        const turnInfo = nextTurn(code);
        io.to(code).emit('game-started', turnInfo);
        sendWord(code, turnInfo.explainerId);
        startTimer(io, code);
      }
    }, 1000);
    roomTimers.set(code, interval);
  }

  function endGame(io, code, winner) {
    const interval = roomTimers.get(code);
    if (interval) clearInterval(interval);
    roomTimers.delete(code);
    const room = getRoomByCode(code);
    room.phase = 'finished';
    io.to(code).emit('game-over', {
      winner,
      scores: room.scores
    });
  }
}
```

**Step 2: Manual smoke test**

Run: `npm run dev`
Open `http://localhost:3000` — server should start and serve static files (empty page is fine).

**Step 3: Commit**

```bash
git add server/handlers.js
git commit -m "feat: add socket.io event handlers with full game flow"
```

---

### Task 7: Frontend — HTML + CSS

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

**Step 1: Create index.html**

SPA with 5 screen divs (hidden by default, shown via JS). Include Socket.io client from CDN. Screens: `#home`, `#create`, `#lobby`, `#game`, `#results`.

Key elements per screen:
- Home: two buttons
- Create: category checkboxes, score/time selectors, create button
- Lobby: room code display, player list with team columns, start button
- Game: word display (explainer), timer ring, guess/skip buttons (guesser), score bar
- Results: winner banner, scores, play again button

**Step 2: Create style.css**

Mobile-first CSS:
- Max-width 480px container centered
- Team 1 = `#3B82F6` (blue), Team 2 = `#EF4444` (red)
- Buttons min-height 48px, large touch targets
- Game buttons (guess/skip) each 50% height of viewport
- Timer: circular progress ring via SVG
- Fonts: system font stack, word display 3rem+
- Screen transitions: simple fade

**Step 3: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000` — should see Home screen with two buttons.

**Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: add HTML structure and mobile-first CSS for all screens"
```

---

### Task 8: Frontend — Client JS

**Files:**
- Create: `public/app.js`

**Step 1: Implement client app.js**

Structure:
```js
const socket = io();
let state = { screen: 'home', room: null, role: null };

// Screen management
function showScreen(name) { /* hide all, show target */ }

// Home screen
document.getElementById('btn-create').onclick = () => showScreen('create');
document.getElementById('btn-join').onclick = () => /* show code input */;

// Create room
document.getElementById('btn-create-room').onclick = () => {
  socket.emit('create-room', { categories, targetScore, roundTime });
};

// Socket listeners
socket.on('room-created', ({ code }) => { /* show lobby with code */ });
socket.on('player-joined', ({ players }) => { /* update player list */ });
socket.on('game-started', ({ currentTeam, explainerId, guesserId }) => {
  // Determine role: am I explainer, guesser, or observer?
  showScreen('game');
  updateGameUI(role);
});
socket.on('new-word', ({ word }) => { /* show word — explainer only */ });
socket.on('word-result', ({ result, scores }) => { /* flash result, update scores */ });
socket.on('tick', ({ secondsLeft }) => { /* update timer */ });
socket.on('turn-end', ({ scores }) => { /* show round summary briefly */ });
socket.on('game-over', ({ winner, scores }) => { /* show results screen */ });
socket.on('error', ({ message }) => { /* show error toast */ });

// Game actions
document.getElementById('btn-guess').onclick = () => socket.emit('guess');
document.getElementById('btn-skip').onclick = () => socket.emit('skip');
```

**Step 2: Manual end-to-end test**

Run: `npm run dev`
Open 4 browser tabs at `http://localhost:3000`:
1. Tab 1: Create room → get code
2. Tab 2-4: Join with code → enter names
3. Tab 1: Assign teams → Start
4. Verify: explainer sees word, guesser sees buttons, observers see scores
5. Guess/skip a few words, verify scores update
6. Let timer run out, verify turn switch

**Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add client-side game logic with socket.io integration"
```

---

### Task 9: Polish and Edge Cases

**Files:**
- Modify: `server/handlers.js` (reconnection logic)
- Modify: `public/app.js` (sessionStorage, error states)
- Modify: `public/style.css` (animations, final polish)

**Step 1: Add reconnection support**

In `public/app.js`: save `sessionId` to sessionStorage on connect. On reconnect, send `rejoin-room` with saved sessionId. In `server/handlers.js`: handle `rejoin-room` — look up player by saved id, reassign socket.

**Step 2: Add error/disconnect UI states**

- "Waiting for player..." overlay when someone disconnects during game
- "Room not found" toast on bad code
- "Room is full" toast

**Step 3: Add turn-end animation**

Brief (2s) overlay showing round score before next team starts.

**Step 4: Full end-to-end playtest**

Test full game from start to victory with 4 tabs. Test disconnect/reconnect. Test wrong room codes.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add reconnection, error states, turn animations"
```

---

### Task 10: Deploy Setup

**Files:**
- Modify: `package.json` (engines field)
- Create: `render.yaml` (optional — Render blueprint)

**Step 1: Add engines to package.json**

```json
"engines": { "node": ">=20.0.0" }
```

**Step 2: Verify production start**

Run: `NODE_ENV=production npm start`
Expected: Server starts on port 3000.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add node engine requirement for deploy"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Project bootstrap | — |
| 2 | Word dictionary | 4 tests |
| 3 | Game state | 8 tests |
| 4 | Game rules | 6 tests |
| 5 | Express + Socket.io server | manual |
| 6 | Socket.io handlers | manual |
| 7 | Frontend HTML + CSS | manual |
| 8 | Frontend client JS | manual e2e |
| 9 | Polish + edge cases | manual e2e |
| 10 | Deploy setup | manual |

Total: ~18 unit tests + manual e2e testing
