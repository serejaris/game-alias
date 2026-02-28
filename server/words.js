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
