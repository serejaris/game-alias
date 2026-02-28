# Alias Game — Design Document

## Overview

Multiplayer word-guessing game (Alias) for 2 teams of 2 players. Each player on their own device, real-time sync via WebSocket.

## Stack

- **Frontend:** Vanilla HTML/CSS/JS, single-page app, mobile-first
- **Backend:** Node.js + Express + Socket.io
- **Deploy:** Single server (Render/Railway) — serves static files + WebSocket

## Project Structure

```
game-alias/
├── server/
│   ├── index.js           # Express + Socket.io bootstrap
│   ├── handlers.js        # Socket.io event handlers (only file aware of Socket.io)
│   ├── state.js           # Pure functions for game state management
│   ├── rules.js           # Business rules: penalties, win condition, validation
│   ├── words.js           # Scans words/*.json, serves words without repeats
│   └── words/
│       └── general.json   # Starter dictionary (~300-500 words)
├── public/
│   ├── index.html         # SPA — all screens
│   ├── style.css          # Mobile-first styles
│   └── app.js             # Client: screen rendering + Socket.io client
└── package.json
```

## Layer Responsibilities

- **handlers.js** — receives client events, calls state and rules, sends responses. Only file that imports Socket.io
- **state.js** — pure functions: create room, add player, update score, switch turn. No side effects
- **rules.js** — business rules: can skip?, skip penalty (-1), win condition (first team to N points), action validation
- **words.js** — reads all `.json` from `words/` at startup, builds available categories list. Adding a new file = new category in lobby. No code changes needed

## Gameplay

### Flow

1. **Create room** — host picks categories, target score (default 50), round time (60s). Gets 4-digit room code
2. **Lobby** — 4 players join by code, enter name. Host assigns teams (2+2), hits Start
3. **Round** — one team plays, other watches:
   - Explainer sees word on screen, explains verbally
   - Guesser listens, taps on their device: guess (+1) or skip (-1 penalty)
   - 60s timer visible to all
   - Time's up — round summary, turn passes to other team
4. **Role swap** — explainer and guesser swap every round within team
5. **Victory** — first team to target score. Results screen: score, stats, skip count

### Who Sees What

| Role | Screen |
|------|--------|
| Explainer | Word in large font + timer ring. No buttons — hands free |
| Guesser | Timer + two large buttons (green check / yellow skip), half-screen each |
| Waiting team | Timer + both teams' scores + "Team X is playing" indicator |

## Screens

1. **Home** — logo, two buttons: "Create Game" / "Join by Code"
2. **Create Room** — category checkboxes, target score slider (30/50/70), round time (30/45/60s)
3. **Lobby** — room code prominent, 4 player slots, two columns (blue Team 1 / red Team 2), drag or tap to move. Host's Start button (active when 4 players, 2+2)
4. **Game** — adapts per role (see table above). 48px minimum tap targets
5. **Results** — final score, winner name, round stats. "Play Again" button (new game, same players)

**Colors:** blue vs red for teams, white background, large elements

## Socket.io Events

### Client → Server

| Event | Data | When |
|-------|------|------|
| `create-room` | `{categories, targetScore, roundTime}` | Host creates room |
| `join-room` | `{code, playerName}` | Player joins by code |
| `switch-team` | `{playerId, team}` | Host moves player between teams |
| `start-game` | — | Host hits Start |
| `guess` | — | Guesser taps check |
| `skip` | — | Guesser taps skip |

### Server → Clients

| Event | Data | To |
|-------|------|----|
| `room-created` | `{code}` | Host only |
| `player-joined` | `{players, teams}` | All in room |
| `game-started` | `{currentTeam, explainer, guesser}` | All |
| `new-word` | `{word}` | Explainer only |
| `word-result` | `{result, score}` | All |
| `tick` | `{secondsLeft}` | All |
| `turn-end` | `{roundScore, totalScores}` | All |
| `game-over` | `{winner, stats}` | All |

**Key:** word is sent ONLY to the explainer. Guesser and observers never receive it.

## Edge Cases

### Disconnect

- Server allows 30s reconnect (session ID in sessionStorage)
- If returned — continues from same state
- If not — game paused, others see "Waiting for player...". After 60s host can kick, game ends (4 players required)
- Disconnect during round — round pauses, earned points preserved

### Room Lifecycle

- Room code lives while at least one player connected
- Exactly 4 players max — 5th gets "Room is full"
- 10 min inactivity — auto-cleanup

### Anti-cheat

- Timer runs on server (client timer is display only)
- Words served by server, client doesn't know next word
- Round results calculated server-side
