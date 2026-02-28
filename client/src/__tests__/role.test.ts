import { describe, expect, it } from 'vitest';
import { isStaleTurn, resolveRole } from '../utils/role';

describe('role utilities', () => {
  it('uses server-provided role when valid', () => {
    expect(resolveRole('a', 'x', 'y', 'guesser')).toBe('guesser');
  });

  it('derives role from turn ids as fallback', () => {
    expect(resolveRole('a', 'a', 'b')).toBe('explainer');
    expect(resolveRole('b', 'a', 'b')).toBe('guesser');
    expect(resolveRole('c', 'a', 'b')).toBe('observer');
  });

  it('checks stale turns', () => {
    expect(isStaleTurn(4, 5)).toBe(true);
    expect(isStaleTurn(5, 5)).toBe(false);
    expect(isStaleTurn(undefined, 5)).toBe(false);
  });
});
