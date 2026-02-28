import { describe, expect, it } from 'vitest';
import { getSecondsRemaining, resolveDeadline } from '../utils/time';

describe('time utilities', () => {
  it('prefers server deadline when present', () => {
    const now = 1_000;
    expect(resolveDeadline(5, 9_000, now)).toBe(9_000);
  });

  it('builds deadline from duration when server deadline missing', () => {
    const now = 2_000;
    expect(resolveDeadline(5, undefined, now)).toBe(7_000);
  });

  it('returns non-negative seconds remaining', () => {
    expect(getSecondsRemaining(5_000, 4_200)).toBe(1);
    expect(getSecondsRemaining(5_000, 6_000)).toBe(0);
  });
});
