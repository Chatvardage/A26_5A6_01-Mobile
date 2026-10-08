import { mapWithConcurrency } from '@/utils/mapWithConcurrency';

describe('mapWithConcurrency', () => {
  it("conserve l'ordre du résultat et respecte la limite", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      running--;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it('gère une liste vide', async () => {
    expect(await mapWithConcurrency([], 5, async (x) => x)).toEqual([]);
  });
});
