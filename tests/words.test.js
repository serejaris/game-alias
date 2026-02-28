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
      expect(words1).not.toEqual(words2);
    });
  });
});
