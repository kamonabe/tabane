// シード付きの乱数。同じシードなら同じ展開になるので、テストや不具合の再現に使える。
export type Rng = () => number;

// mulberry32: 32bit のシードから 0 以上 1 未満の数を返す
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// min 以上 max 以下の整数
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: items is empty");
  return items[Math.floor(rng() * items.length)];
}

// p の確率で true
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

// 重みつきで1つ選ぶ。重みが0以下の候補は選ばれない
export function weightedPick<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) throw new Error("weightedPick: no positive weight");
  let r = rng() * total;
  for (const i of items) {
    if (i.weight <= 0) continue;
    r -= i.weight;
    if (r < 0) return i.item;
  }
  return items[items.length - 1].item;
}
