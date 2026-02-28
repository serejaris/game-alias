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
      expect(checkWin({ 1: -3, 2: 10 }, 50)).toBe(null);
    });
  });
});
