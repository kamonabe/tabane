import { describe, expect, it } from "vitest";
import { createRng, pick, randomInt } from "./random";

describe("createRng", () => {
  it("同じシードなら同じ並びになる", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("0 以上 1 未満の数を返す", () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randomInt", () => {
  it("範囲の両端を含む", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(randomInt(rng, 3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe("pick", () => {
  it("空の配列ではエラーになる", () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });
});
