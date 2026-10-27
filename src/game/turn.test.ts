import { describe, expect, it } from "vitest";
import { addAction, setMode } from "./actions";
import { REVIEW_REVEAL_FRAC, REVIEW_REVEAL_MAX, REVIEW_WASTE_MULT, WASTE_BIAS } from "./balance";
import { reportedDone } from "./derived";
import { nextTurn, resolveTurn } from "./turn";
import { baseState, member, rng } from "./testUtils";
import { randomInt } from "./random";
import type { GameState, LeaderAction } from "./types";

const W = WASTE_BIAS.normal;
const withPlan = (s: GameState, ...plan: LeaderAction[]): GameState => ({ ...s, plan, apUsed: plan.length });

describe("resolveTurn の順序", () => {
  it("育成は出力計算より先（スキルが上がってから出力が決まる）", () => {
    const s = withPlan(baseState(), { kind: "coach", memberId: "m1", skill: "design" });
    const r = resolveTurn(s);
    expect(r.members[0].skills.design).toBe(4);
    // 育成された人は出力半分、士気+3 は出力計算の前
    const coached = 5 * (0.7 + 63 / 200) * 0.5;
    expect(r.doneWork).toBeCloseTo((coached + 4) * (1 - W));
  });

  it("レビューの公開は、その回の申告ずれが生まれたあと", () => {
    const s = withPlan({ ...baseState(), hiddenGap: 20 }, { kind: "review" });
    const r = resolveTurn(s);
    const total = 20 + 8 * W * REVIEW_WASTE_MULT;
    expect(r.hiddenGap).toBeCloseTo(total - Math.min(total * REVIEW_REVEAL_FRAC, REVIEW_REVEAL_MAX));
    expect(r.lastReviewTurn).toBe(5);
  });

  it("要件フェーズの出力は clarity に入り doneWork は増えない", () => {
    const s = withPlan({ ...baseState(), turn: 3, clarity: 40 }, { kind: "review" });
    const r = resolveTurn(s);
    expect(r.doneWork).toBe(0);
    expect(r.clarity).toBeCloseTo(40 + 8 * 0.3);
  });

  it("clarity があふれた分は半分だけ doneWork になる", () => {
    const s = withPlan({ ...baseState(), turn: 3, clarity: 99 }, { kind: "review" });
    const r = resolveTurn(s);
    expect(r.clarity).toBe(100);
    expect(r.doneWork).toBeCloseTo(((99 + 2.4 - 100) / 0.3) * 0.5);
  });
});

describe("申告のずれ", () => {
  const team = (trait: "careful" | "optimistic") => baseState({ members: [member("a", { trait }), member("b", { trait })] });
  it("きっちりチームは楽観的チームよりずれが小さい", () => {
    const a = resolveTurn(withPlan(team("careful"), { kind: "oneOnOne", memberId: "a" }));
    const b = resolveTurn(withPlan(team("optimistic"), { kind: "oneOnOne", memberId: "a" }));
    expect(a.hiddenGap).toBeLessThan(b.hiddenGap);
  });
  it("レビューがあるとずれの発生が減り、見つかったずれの一部だけが公開される", () => {
    const base = { ...baseState(), hiddenGap: 20 };
    const a = resolveTurn(withPlan(base, { kind: "oneOnOne", memberId: "m1" }));
    const b = resolveTurn(withPlan(base, { kind: "review" }));
    expect(a.hiddenGap - 20).toBeCloseTo(8 * W);
    const total = 20 + (a.hiddenGap - 20) * REVIEW_WASTE_MULT;
    expect(b.hiddenGap).toBeCloseTo(total - Math.min(total * REVIEW_REVEAL_FRAC, REVIEW_REVEAL_MAX));
    expect(b.hiddenGap).toBeGreaterThan(0); // 一度のレビューでは全部は見えない
  });
  it("チーム行動がないと ×1.25 で、全員の士気 −3", () => {
    const a = resolveTurn(withPlan(baseState(), { kind: "handsOn" }));
    const b = resolveTurn(withPlan(baseState(), { kind: "opsSync" }, { kind: "oneOnOne", memberId: "m2" }));
    expect(a.hiddenGap).toBeCloseTo(8 * W * 1.25);
    expect(b.hiddenGap).toBeCloseTo(8 * W);
    expect(a.members[0].morale).toBe(57);
    expect(b.members[0].morale).toBe(60);
  });
  it("テストフェーズでは hiddenGap が 40% 公開される", () => {
    const s = baseState({ turn: 10, hiddenGap: 10, members: [member("a", { mode: "support" })] });
    expect(resolveTurn(withPlan(s, { kind: "handsOn" })).hiddenGap).toBeCloseTo(6);
  });
});

describe("放置とお金", () => {
  it("運用を3ターン放置すると ops −4、外注を4ターン放置すると vendor −3", () => {
    const c = member("c", { employment: "contractor", ratePerTurn: 50 });
    const s = baseState({ members: [member("a"), c], turnsSinceOpsSync: 2, turnsSinceVendorTalk: 3 });
    const r = resolveTurn(withPlan(s, { kind: "review" }));
    expect(r.trust.ops).toBe(56);
    expect(r.trust.vendor).toBe(47);
    const ok = resolveTurn(withPlan(s, { kind: "opsSync" }, { kind: "vendorTalk" }));
    expect(ok.trust.ops).toBe(65);
    expect(ok.trust.vendor).toBe(55);
  });
  it("予算が尽きたら外注が全員抜ける", () => {
    const c = member("c", { employment: "contractor", ratePerTurn: 100 });
    const s = baseState({ members: [member("a"), c], budget: 50 });
    const r = resolveTurn(withPlan(s, { kind: "review" }));
    expect(r.members[1].left).toBe(true);
    expect(r.overBudget).toBe(true);
    expect(r.departures).toBe(0);
    expect(r.trust.steering).toBe(50);
  });
  it("契約期限のメンバはそのターンの終わりに抜ける", () => {
    const s = baseState({ members: [member("a"), member("h", { leavesAfterTurn: 5 })] });
    expect(resolveTurn(s).members[1].left).toBe(true);
  });
});

describe("nextTurn", () => {
  it("AP とペナルティを更新する", () => {
    const s = nextTurn({ ...baseState({ turn: 5 }), nextTurnApPenalty: 1 });
    expect(s.turn).toBe(6);
    expect(s.apMax).toBe(2); // ステコミ −1、ペナルティ −1
    expect(s.nextTurnApPenalty).toBe(0);
  });
});

describe("不変条件（ランダムな行動で100ターン）", () => {
  it("reportedDone = doneWork + hiddenGap、doneWork ≤ totalWork", () => {
    const r = rng(3);
    let s = baseState({ turn: 1, members: [member("a"), member("b", { trait: "optimistic" }), member("c", { mode: "push" })] });
    s = { ...s, clarity: 20, initialClarity: 20 };
    for (let i = 0; i < 100; i++) {
      for (const m of s.members) s = setMode(s, m.id, (["normal", "push", "rest", "support"] as const)[randomInt(r, 0, 3)]);
      for (const kind of ["handsOn", "review", "opsSync", "nemawashi"] as const) if (r() < 0.5) s = addAction(s, { kind });
      s = resolveTurn(s);
      expect(reportedDone(s)).toBeCloseTo(s.doneWork + s.hiddenGap);
      expect(s.doneWork).toBeLessThanOrEqual(s.totalWork + 1e-9);
      expect(s.hiddenGap).toBeGreaterThanOrEqual(0);
      expect(s.quality).toBeGreaterThanOrEqual(0);
      expect(s.quality).toBeLessThanOrEqual(100);
      s = { ...nextTurn(s), turn: 5 + (i % 6), deadline: 12 };
      s.members.forEach((m) => (m.awayTurns = 0));
    }
  });
});
