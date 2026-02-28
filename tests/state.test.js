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
