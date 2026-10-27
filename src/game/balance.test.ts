import { describe, expect, it } from "vitest";
import { balanced, careless, isGoodOutcome, mixed, passive, playGame, unfinishedRatio } from "./sim/strategies";
import type { Strategy } from "./sim/strategies";

const N = 200;
const seeds = Array.from({ length: N }, (_, i) => i + 1);
const run = (st: Strategy) => seeds.map((seed) => playGame(seed, st));
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;

describe("バランス（各 200 シード）", () => {
  const results = new Map<string, ReturnType<typeof run>>();
  const get = (st: Strategy) => {
    if (!results.has(st.name)) results.set(st.name, run(st));
    return results.get(st.name)!;
  };

  it("雑な遊び方は良い結末にほぼならない（< 10%）", () => {
    expect(rate(get(careless).map(isGoodOutcome))).toBeLessThan(0.1);
  });
  it("放置・そこそこも、バランスよりずっと悪い", () => {
    expect(rate(get(passive).map(isGoodOutcome))).toBeLessThan(0.1);
    expect(rate(get(mixed).map(isGoodOutcome))).toBeLessThan(0.3);
  });
  it("バランスの良い遊び方は良い結末が多い（> 60%）、未完成は少ない（< 10%）", () => {
    const rs = get(balanced);
    expect(rate(rs.map(isGoodOutcome))).toBeGreaterThan(0.6);
    expect(rs.reduce((a, s) => a + unfinishedRatio(s), 0) / N).toBeLessThan(0.1);
  });
  it("どのシードでも例外なく終わる（終了ターン ≤ 14、status が finished）", () => {
    for (const st of [careless, passive, mixed, balanced]) {
      for (const s of get(st)) {
        expect(s.status).toBe("finished");
        expect(s.outcome!.releaseTurn).toBeLessThanOrEqual(14);
      }
    }
  });
  it("同じ seed と同じ戦略なら同じ Outcome", () => {
    for (const seed of [3, 17, 99]) {
      expect(playGame(seed, balanced).outcome).toEqual(playGame(seed, balanced).outcome);
    }
  });
}, 120000);
