import { describe, expect, it } from "vitest";
import { addAction, canAddAction, computeApMax, removeAction, setMode } from "./actions";
import { baseState, member } from "./testUtils";

describe("computeApMax", () => {
  it("基本4、ステコミ −1、サポート最大+2、ペナルティ、最低1", () => {
    const s = baseState({ turn: 5 });
    expect(computeApMax(s)).toBe(4);
    expect(computeApMax({ ...s, turn: 6 })).toBe(3);
    const sup = baseState({ members: [member("a", { mode: "support" }), member("b", { mode: "support" }), member("c", { mode: "support" })] });
    expect(computeApMax(sup)).toBe(6);
    const low = baseState({ members: [member("a", { mode: "support", skills: { design: 3, build: 3, test: 3, domain: 3, coord: 2 } })] });
    expect(computeApMax(low)).toBe(4);
    expect(computeApMax(baseState({ apPenalty: 1 }))).toBe(3);
    expect(computeApMax(baseState({ turn: 6, apPenalty: 9 }))).toBe(1);
  });
});

describe("addAction / removeAction", () => {
  it("AP 超過・上限回数が拒否され、取り消しで AP が戻る", () => {
    let s = baseState();
    s = addAction(s, { kind: "handsOn" });
    s = addAction(s, { kind: "handsOn" });
    expect(canAddAction(s, { kind: "handsOn" }).ok).toBe(false);
    s = addAction(s, { kind: "review" });
    expect(canAddAction(s, { kind: "review" }).ok).toBe(false);
    s = addAction(s, { kind: "opsSync" });
    expect(s.apUsed).toBe(4);
    expect(canAddAction(s, { kind: "nemawashi" }).reason).toContain("時間");
    s = removeAction(s, 0);
    expect(s.apUsed).toBe(3);
    expect(canAddAction(s, { kind: "nemawashi" }).ok).toBe(true);
  });
  it("休み中の対象・育成の回数上限・1on1 は人ごとに1回", () => {
    const s = baseState({ members: [member("a", { awayTurns: 1 }), member("b", { coachedCount: 2 }), member("j", { archetype: "junior", coachedCount: 2 })] });
    expect(canAddAction(s, { kind: "oneOnOne", memberId: "a" }).ok).toBe(false);
    expect(canAddAction(s, { kind: "coach", memberId: "b", skill: "build" }).ok).toBe(false);
    expect(canAddAction(s, { kind: "coach", memberId: "j", skill: "build" }).ok).toBe(true);
    const t = addAction(s, { kind: "oneOnOne", memberId: "b" });
    expect(canAddAction(t, { kind: "oneOnOne", memberId: "b" }).ok).toBe(false);
  });
  it("拒否されたら状態はそのまま、元の状態は書き換えない", () => {
    const s = baseState();
    const t = addAction(s, { kind: "review" });
    expect(s.plan).toHaveLength(0);
    expect(t.plan).toHaveLength(1);
    expect(addAction(t, { kind: "review" })).toBe(t);
  });
  it("調整サポートで増えた AP を使っていると、切り替えを戻せない", () => {
    let s = baseState({ members: [member("a", { mode: "support" }), member("b")] });
    s = { ...s, apMax: 5 };
    s = addAction(s, { kind: "handsOn" });
    s = addAction(s, { kind: "handsOn" });
    s = addAction(s, { kind: "review" });
    s = addAction(s, { kind: "opsSync" });
    s = addAction(s, { kind: "nemawashi" });
    expect(setMode(s, "a", "normal")).toBe(s);
  });
});
