import { describe, expect, it } from "vitest";
import { applyModeEffects, debtFactor, memberOutput } from "./members";
import { member } from "./testUtils";

describe("memberOutput", () => {
  it("build 3, ふつう, 士気60, 疲労10, 負債0 → 4.0", () => {
    expect(memberOutput(member("a"), "build", 0, false)).toBeCloseTo(4.0);
  });
  it("疲労の境目 50 / 80", () => {
    expect(memberOutput(member("a", { fatigue: 49 }), "build", 0, false)).toBeCloseTo(4);
    expect(memberOutput(member("a", { fatigue: 50 }), "build", 0, false)).toBeCloseTo(3.4);
    expect(memberOutput(member("a", { fatigue: 79 }), "build", 0, false)).toBeCloseTo(3.4);
    expect(memberOutput(member("a", { fatigue: 80 }), "build", 0, false)).toBeCloseTo(2.6);
  });
  it("負債係数は 0.6 が下限", () => {
    expect(debtFactor(50)).toBeCloseTo(0.8);
    expect(debtFactor(100)).toBeCloseTo(0.6);
    expect(debtFactor(100)).toBe(0.6);
  });
  it("立ち上がり・育成は半分、働き方で変わる", () => {
    expect(memberOutput(member("a", { rampTurns: 1 }), "build", 0, false)).toBeCloseTo(2);
    expect(memberOutput(member("a"), "build", 0, true)).toBeCloseTo(2);
    expect(memberOutput(member("a", { mode: "push" }), "build", 0, false)).toBeCloseTo(5.6);
    expect(memberOutput(member("a", { mode: "rest" }), "build", 0, false)).toBeCloseTo(1.6);
    expect(memberOutput(member("a", { mode: "support" }), "build", 0, false)).toBe(0);
  });
});

describe("applyModeEffects", () => {
  it("働き方ごとの士気・疲労", () => {
    const n = member("a", { morale: 50, fatigue: 10 });
    applyModeEffects(n);
    expect([n.fatigue, n.morale]).toEqual([14, 51]);
    const p = member("a", { mode: "push", morale: 50, fatigue: 10 });
    applyModeEffects(p);
    expect([p.fatigue, p.morale]).toEqual([26, 46]);
    const r = member("a", { mode: "rest", morale: 50, fatigue: 10 });
    applyModeEffects(r);
    expect([r.fatigue, r.morale]).toEqual([0, 53]);
    const s = member("a", { mode: "support", morale: 70, fatigue: 10 });
    applyModeEffects(s);
    expect([s.fatigue, s.morale]).toEqual([13, 69]);
  });
  it("0..100 に収まる", () => {
    const p = member("a", { mode: "push", morale: 2, fatigue: 95 });
    applyModeEffects(p);
    expect([p.fatigue, p.morale]).toEqual([100, 0]);
  });
});
