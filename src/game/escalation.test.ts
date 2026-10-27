import { describe, expect, it } from "vitest";
import { applyEscalation, approvalScore, escalate, outcomeOf } from "./escalation";
import { baseState, fixedRng } from "./testUtils";
import type { EscalationSource, EscalationStyle, EscalationType, GameState } from "./types";

const score = (s: GameState, type: EscalationType = "addStaff", style: EscalationStyle = "quick", source: EscalationSource = "turn") =>
  approvalScore(s, type, style, source).score;
const s5 = () => baseState({ turn: 5, doneWork: 0 }); // behind = 0.125（裏付けあり +10）

describe("approvalScore", () => {
  it("基本: 信頼 + 裏付け", () => {
    expect(score(s5())).toBe(70);
  });
  it("準備 +15 / 根回し +15（今のターン・前のターン）", () => {
    expect(score(s5(), "addStaff", "prepared")).toBe(85);
    expect(score({ ...s5(), plan: [{ kind: "nemawashi" }] })).toBe(85);
    expect(score({ ...s5(), lastTurnNemawashi: true })).toBe(85);
  });
  it("時期: ターン2以下 +15 / 7以降 −10", () => {
    expect(score({ ...s5(), turn: 2 })).toBe(75); // 裏付けはターン5以降だけ
    expect(score({ ...s5(), turn: 7 })).toBe(60);
  });
  it("種類ごとの補正と締切の固さ", () => {
    expect(score(s5(), "addBudget")).toBe(60);
    expect(score(s5(), "cutScope")).toBe(65);
    expect(score(s5(), "extendSchedule")).toBe(70);
    const firm = s5();
    firm.profile.deadlineFirm = true;
    expect(score(firm, "extendSchedule")).toBe(45);
    expect(score({ ...s5(), budget: 100 })).toBe(55);
  });
  it("裏付け: 順調と言っていたのに遅れていないと −10", () => {
    expect(score({ ...s5(), doneWork: 50 })).toBe(50);
    expect(score({ ...s5(), doneWork: 50 }, "cutScope")).toBe(65);
  });
  it("回数ペナルティ・ごまかしペナルティ", () => {
    expect(score({ ...s5(), escalationCount: 2 })).toBe(50);
    expect(score({ ...s5(), glossDebt: 1 })).toBe(55);
    expect(score({ ...s5(), glossDebt: 1 }, "cutScope")).toBe(65);
  });
  it("リカバリ案 +15、再見積もり +20（回数ペナルティなし）、ステコミ起点は準備扱い", () => {
    expect(score(s5(), "addStaff", "quick", "recovery")).toBe(70 + 15 + 15);
    expect(score({ ...s5(), escalationCount: 3 }, "addStaff", "quick", "reestimate")).toBe(70 + 15 + 20);
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
