import { canModerate } from '@/types/serverRole';

describe('canModerate', () => {
  it.each([
    ['moderateur', true],
    ['proprietaire', true],
    ['admin', true],
    ['membre', false],
    [null, false],
    [undefined, false],
    [42, false],
    ['inconnu', false],
    ['toString', false],
  ])('%p → %s', (role, expected) => {
    expect(canModerate(role)).toBe(expected);
  });
});
