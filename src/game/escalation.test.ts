import { describe, expect, it } from "vitest";
import { applyEscalation, approvalScore, escalate, outcomeOf } from "./escalation";
import { hireCandidate } from "./vendor";
import { baseState, fixedRng, member } from "./testUtils";
import type { EscalationSource, EscalationStyle, EscalationType, GameState } from "./types";

const score = (s: GameState, type: EscalationType = "addStaff", style: EscalationStyle = "quick", source: EscalationSource = "turn") =>
  approvalScore(s, type, style, source).score;
const s5 = () => baseState({ turn: 5, doneWork: 0 }); // behind = 0.125（裏付けあり +10）

describe("approvalScore", () => {
  it("基本: 信頼 + 裏付け（人を増やす相談は「人とお金の両方」で −5）", () => {
    expect(score(s5())).toBe(65);
  });
  it("準備 +15 / 根回し +15（今のターン・前のターン）", () => {
    expect(score(s5(), "addStaff", "prepared")).toBe(80);
    expect(score({ ...s5(), plan: [{ kind: "nemawashi" }] })).toBe(80);
    expect(score({ ...s5(), lastTurnNemawashi: true })).toBe(80);
  });
  it("時期: ターン2以下 +15 / 7以降 −10", () => {
    expect(score({ ...s5(), turn: 2 })).toBe(70); // 裏付けはターン5以降だけ
    expect(score({ ...s5(), turn: 7 })).toBe(55);
  });
  it("種類ごとの補正と締切の固さ", () => {
    expect(score(s5(), "addBudget")).toBe(60);
    expect(score(s5(), "cutScope")).toBe(65);
    expect(score(s5(), "extendSchedule")).toBe(70);
    const firm = s5();
    firm.profile.deadlineFirm = true;
    expect(score(firm, "extendSchedule")).toBe(45);
    expect(score({ ...s5(), budget: 100 })).toBe(65); // 予算の見通しは通りやすさに関係しない
  });
  it("裏付け: 順調と言っていたのに遅れていないと −10", () => {
    expect(score({ ...s5(), doneWork: 50 })).toBe(45);
    expect(score({ ...s5(), doneWork: 50 }, "cutScope")).toBe(65);
  });
  it("回数ペナルティ・ごまかしペナルティ", () => {
    expect(score({ ...s5(), escalationCount: 2 })).toBe(45);
    expect(score({ ...s5(), glossDebt: 1 })).toBe(50);
    expect(score({ ...s5(), glossDebt: 1 }, "cutScope")).toBe(65);
  });
  it("リカバリ案 +15、再見積もり +20（回数ペナルティなし）、ステコミ起点は準備扱い", () => {
    expect(score(s5(), "addStaff", "quick", "recovery")).toBe(65 + 15 + 15);
    expect(score({ ...s5(), escalationCount: 3 }, "addStaff", "quick", "reestimate")).toBe(65 + 15 + 20);
  });
  it("目安ラベル", () => {
    expect(approvalScore(s5(), "addStaff", "prepared", "turn").guide).toBe("good");
    expect(approvalScore(s5(), "addStaff", "quick", "turn").guide).toBe("fair");
    expect(approvalScore({ ...s5(), doneWork: 50 }, "addBudget", "quick", "turn").guide).toBe("hard");
  });
});

describe("結果", () => {
  it("しきい値 70 / 50", () => {
    expect([outcomeOf(70), outcomeOf(69), outcomeOf(50), outcomeOf(49)]).toEqual(["approved", "conditional", "conditional", "rejected"]);
  });
  it("乱数でも3つに分かれ、却下は steering −2、AP を使う", () => {
    // score 70: roll = 70 + randomInt(-10..10)。rng 0 → -10 → 60 (条件付き)、0.99 → +10 → 80 (承認)
    const a = escalate(s5(), "addBudget", "prepared", fixedRng(0.99));
    expect(a.escalations[0].outcome).toBe("approved");
    expect(a.budget).toBe(1250);
    expect(a.apUsed).toBe(2);
    const b = escalate(s5(), "addBudget", "quick", fixedRng(0.5));
    expect(b.escalations[0].outcome).toBe("conditional");
    expect(b.budget).toBe(1120);
    const c = escalate({ ...s5(), doneWork: 50 }, "addBudget", "quick", fixedRng(0));
    expect(c.escalations[0].outcome).toBe("rejected");
    expect(c.trust.steering).toBe(58);
    expect(c.escalationCount).toBe(1);
    expect(c.escalatedThisTurn).toBe(true);
  });
  it("1ターン1回、AP が足りないときは拒否", () => {
    const a = escalate(s5(), "addBudget", "quick", fixedRng(0.5));
    expect(escalate(a, "addBudget", "quick", fixedRng(0.5))).toBe(a);
    expect(escalate({ ...s5(), apUsed: 3 }, "addBudget", "prepared", fixedRng(0.5)).escalations).toHaveLength(0);
  });
  it("人を増やす承認は外注交渉を開く（条件付きは若手・中堅のみ）", () => {
    const s = escalate(s5(), "addStaff", "prepared", fixedRng(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5));
    expect(s.pending?.kind).toBe("vendor");
  });
  it("予算が少なくても、増員が予算を理由に却下・期間限定にならない", () => {
    const low = { ...s5(), budget: 100 };
    expect(score(low)).toBe(score(s5()));
    const a = escalate(low, "addStaff", "prepared", fixedRng(0.99));
    expect(a.escalations[0].outcome).toBe("approved");
    expect(a.pending).toMatchObject({ kind: "vendor", conditional: false });
  });
  it("増員を採用すると、その人の費用が budget と approvedBudget に足される", () => {
    const base = { ...s5(), turn: 4, deadline: 12 };
    const hire = (conditional: boolean, index: number) => {
      // 得点 55（ターン4）。準備して 0.99 なら承認、さっと口頭で 0.5 なら条件付き
      const s = conditional ? escalate(base, "addStaff", "quick", fixedRng(0.5)) : escalate(base, "addStaff", "prepared", fixedRng(0.99));
      return hireCandidate(s, index);
    };
    const full = hire(false, 1); // 中堅 110 × 残り 8 ターン
    expect([full.budget, full.approvedBudget, full.fundedStaff]).toEqual([1880, 1880, 880]);
    expect(full.members[full.members.length - 1].rampTurns).toBe(2);
    expect(full.nextTurnApPenalty).toBe(1);
    const cond = hire(true, 2); // 若手 80 × min(3, 8)
    expect([cond.budget, cond.approvedBudget]).toEqual([1240, 1240]);
    const late = escalate({ ...base, turn: 11 }, "addStaff", "quick", fixedRng(0.5));
    expect(hireCandidate(late, 1).budget).toBe(1000 + 110); // min(3, 1)
  });
  it("リリース判定より前の延長は計画変更。外注費は budget にだけ足される", () => {
    const c = member("c", { employment: "contractor", ratePerTurn: 100 });
    const s = { ...s5(), deadline: 12, committedDeadline: 12, members: [...s5().members, c] };
    const a = structuredClone(s);
    applyEscalation(a, "extendSchedule", "approved", fixedRng(0), "turn");
    expect([a.deadline, a.committedDeadline, a.replanned, a.trust.ops]).toEqual([14, 14, true, 57]);
    expect([a.budget, a.approvedBudget, a.unplannedCost]).toEqual([1200, 1000, 200]);
    const r = structuredClone(s);
    applyEscalation(r, "extendSchedule", "approved", fixedRng(0), "release");
    expect([r.deadline, r.committedDeadline, r.replanned, r.trust.ops]).toEqual([14, 12, false, 60]);
    expect([r.budget, r.approvedBudget]).toEqual([1200, 1000]);
  });
  it("範囲を減らしても reportedDone は下回らない。承認 −15%、条件付き −8%", () => {
    const s = { ...s5(), totalWork: 100, originalTotalWork: 100, doneWork: 90 };
    const a = structuredClone(s);
    applyEscalation(a, "cutScope", "approved", fixedRng(0));
    expect(a.totalWork).toBe(90);
    const b = { ...structuredClone(s), doneWork: 0 };
    applyEscalation(b, "cutScope", "approved", fixedRng(0));
    expect(b.totalWork).toBe(85);
    expect(b.trust.ops).toBe(54);
    const c = { ...structuredClone(s), doneWork: 0, plan: [{ kind: "opsSync" as const }] };
    applyEscalation(c, "cutScope", "conditional", fixedRng(0));
    expect(c.totalWork).toBe(92);
    expect(c.trust.ops).toBe(58);
    expect(c.scopeCutTotal).toBe(8);
  });
  it("締切は +2 / +1、上限 14", () => {
    const a = { ...s5(), deadline: 12 };
    applyEscalation(a, "extendSchedule", "approved", fixedRng(0));
    expect(a.deadline).toBe(14);
    const b = { ...s5(), deadline: 13 };
    applyEscalation(b, "extendSchedule", "approved", fixedRng(0));
    expect(b.deadline).toBe(14);
    const c = { ...s5(), deadline: 12 };
    applyEscalation(c, "extendSchedule", "conditional", fixedRng(0));
    expect(c.deadline).toBe(13);
  });
});
