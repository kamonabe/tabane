import { describe, expect, it } from "vitest";
import {
  balanced, balancedNoEscalation, careless, isGoodOutcome, mixed, passive, playGame, reviewEveryTurnNoEscalation,
  unfinishedRatio,
} from "./sim/strategies";
import type { Strategy } from "./sim/strategies";

const N = 300;
const seeds = Array.from({ length: N }, (_, i) => i + 1);
const run = (st: Strategy) => seeds.map((seed) => playGame(seed, st));
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;

describe(`バランス（各 ${N} シード）`, () => {
  const results = new Map<string, ReturnType<typeof run>>();
  const get = (st: Strategy) => {
    if (!results.has(st.name)) results.set(st.name, run(st));
    return results.get(st.name)!;
  };
  const good = (st: Strategy) => rate(get(st).map(isGoodOutcome));
  const sawLog = (st: Strategy, test: (kind: string) => boolean) => rate(get(st).map((s) => s.log.some((l) => test(l.kind))));

  it("雑な遊び方は良い結末にほぼならない（< 5%）", () => {
    expect(good(careless)).toBeLessThan(0.05);
  });
  it("放置・そこそこも、バランスよりずっと悪い", () => {
    expect(good(passive)).toBeLessThan(0.1);
    expect(good(mixed)).toBeLessThan(0.3);
  });
  it("バランスの良い遊び方は良い結末が多い（≥ 60%）、未完成は少ない（< 10%）", () => {
    const rs = get(balanced);
    expect(good(balanced)).toBeGreaterThanOrEqual(0.6);
    expect(rs.reduce((a, s) => a + unfinishedRatio(s), 0) / N).toBeLessThan(0.1);
  });
  it("根回しも上申もしないと、はっきり悪くなる（≤ 40%、バランスより 20 ポイント以上低い）", () => {
    expect(good(balancedNoEscalation)).toBeLessThanOrEqual(0.4);
    expect(good(balanced) - good(balancedNoEscalation)).toBeGreaterThanOrEqual(0.2);
  });
  it("毎ターンレビューするだけ（上申なし）では勝ち筋にならない", () => {
    expect(good(reviewEveryTurnNoEscalation)).toBeLessThanOrEqual(0.25);
    expect(good(reviewEveryTurnNoEscalation)).toBeLessThan(good(balanced) - 0.3);
  });
  it("「9割できてます」のずれと上申の気づきが、ちゃんと遊びの中に出てくる（≥ 30%）", () => {
    expect(sawLog(balanced, (k) => k === "gapRevealed")).toBeGreaterThanOrEqual(0.3);
    expect(sawLog(balanced, (k) => k.startsWith("escalation_"))).toBeGreaterThanOrEqual(0.3);
    expect(sawLog(balancedNoEscalation, (k) => k === "gapRevealed")).toBeGreaterThanOrEqual(0.3);
  });
  it("どのシードでも例外なく終わる（終了ターン ≤ 14、status が finished）", () => {
    for (const st of [careless, passive, mixed, balanced, balancedNoEscalation, reviewEveryTurnNoEscalation]) {
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
}, 300000);
