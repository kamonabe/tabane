import { describe, expect, it } from "vitest";
import {
  balanced, balancedNoEscalation, careless, firstTimer, firstTimerHireOnly, firstTimerNoEscalation, mixed, passive, playGame,
  reviewEveryTurnNoEscalation,
} from "./sim/strategies";
import type { Strategy } from "./sim/strategies";
import type { EndingId } from "./types";

const N = 300;
const seeds = Array.from({ length: N }, (_, i) => i + 1);
const run = (st: Strategy) => seeds.map((seed) => playGame(seed, st));
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
const BAD: EndingId[] = ["canceled", "incident", "burnout"];
const NEUTRAL: EndingId[] = ["managed", "quiet"];

// 結末は、ゲーム自身の結末（endingId）だけで数える
describe(`バランス（各 ${N} シード）`, () => {
  const results = new Map<string, ReturnType<typeof run>>();
  const get = (st: Strategy) => {
    if (!results.has(st.name)) results.set(st.name, run(st));
    return results.get(st.name)!;
  };
  const ending = (st: Strategy, ids: EndingId[]) => rate(get(st).map((s) => ids.includes(s.outcome!.endingId)));
  const bundled = (st: Strategy) => ending(st, ["bundled"]);
  const sawLog = (st: Strategy, test: (kind: string) => boolean) => rate(get(st).map((s) => s.log.some((l) => test(l.kind))));

  it("雑な遊び方は、まず崩れる（bundled < 3%、はっきり悪い ≥ 90%）", () => {
    expect(bundled(careless)).toBeLessThan(0.03);
    expect(ending(careless, BAD)).toBeGreaterThanOrEqual(0.9);
  });
  it("放置は bundled にならず、多くは中立の結末（bundled < 5%、はっきり悪い ≤ 45%、中立 ≥ 50%）", () => {
    expect(bundled(passive)).toBeLessThan(0.05);
    expect(ending(passive, BAD)).toBeLessThanOrEqual(0.45);
    expect(ending(passive, NEUTRAL)).toBeGreaterThanOrEqual(0.5);
  });
  it("そこそこ（上申なし）も bundled < 10%", () => {
    expect(bundled(mixed)).toBeLessThan(0.1);
  });
  it("はじめての人は 22〜38% が bundled", () => {
    expect(bundled(firstTimer)).toBeGreaterThanOrEqual(0.22);
    expect(bundled(firstTimer)).toBeLessThanOrEqual(0.38);
  });
  it("上申は得になる。増員だけでも得", () => {
    expect(bundled(firstTimer) - bundled(firstTimerNoEscalation)).toBeGreaterThanOrEqual(0.15);
    expect(bundled(firstTimerHireOnly) - bundled(firstTimerNoEscalation)).toBeGreaterThanOrEqual(0.08);
  });
  it("バランスは 60〜75% が bundled。上申なしでは ≤ 45% で、20 ポイント以上低い", () => {
    expect(bundled(balanced)).toBeGreaterThanOrEqual(0.6);
    expect(bundled(balanced)).toBeLessThanOrEqual(0.75);
    expect(bundled(balancedNoEscalation)).toBeLessThanOrEqual(0.45);
    expect(bundled(balanced) - bundled(balancedNoEscalation)).toBeGreaterThanOrEqual(0.2);
  });
  it("毎ターンレビューするだけ（上申なし）では勝ち筋にならない", () => {
    expect(bundled(reviewEveryTurnNoEscalation)).toBeLessThanOrEqual(0.25);
    expect(bundled(reviewEveryTurnNoEscalation)).toBeLessThanOrEqual(bundled(balanced) - 0.3);
  });
  it("はじめて・バランスとも、予算切れは ≤ 5%", () => {
    for (const st of [firstTimer, balanced]) expect(rate(get(st).map((s) => s.overBudget))).toBeLessThanOrEqual(0.05);
  });
  it("「9割できてます」のずれと上申の結果が、ちゃんと遊びの中に出てくる（≥ 30%）", () => {
    for (const st of [firstTimer, balanced]) {
      expect(sawLog(st, (k) => k === "gapRevealed")).toBeGreaterThanOrEqual(0.3);
      expect(sawLog(st, (k) => k.startsWith("escalation_"))).toBeGreaterThanOrEqual(0.3);
    }
  });
  it("どのシードでも例外なく終わる（終了ターン ≤ 14、status が finished）", () => {
    for (const st of [careless, passive, mixed, firstTimer, firstTimerNoEscalation, firstTimerHireOnly, balanced, balancedNoEscalation, reviewEveryTurnNoEscalation]) {
      for (const s of get(st)) {
        expect(s.status).toBe("finished");
        expect(s.outcome!.releaseTurn).toBeLessThanOrEqual(14);
      }
    }
  });
  it("同じ seed と同じ戦略なら同じ Outcome", () => {
    for (const seed of [3, 17, 99]) {
      expect(playGame(seed, balanced).outcome).toEqual(playGame(seed, balanced).outcome);
      expect(playGame(seed, firstTimer).outcome).toEqual(playGame(seed, firstTimer).outcome);
    }
  });
}, 600000);
