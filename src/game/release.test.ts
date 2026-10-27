import { describe, expect, it } from "vitest";
import { applyRelease, enterRelease, evaluate, finalQualityOf, finishCanceled, gradeDown, gradeUp, incidentChance, pickEnding, releaseOptions, startExtension } from "./release";
import { baseState, fixedRng, member } from "./testUtils";
import type { GameState, Grade, Outcome } from "./types";

const at12 = (over: Partial<GameState> = {}): GameState => {
  const s = baseState({ turn: 12, deadline: 12, doneWork: 80, hiddenGap: 9, quality: 80, ...over });
  enterRelease(s);
  return s;
};

describe("リリース判定", () => {
  it("hiddenGap を全部公開し、2% 以下なら自動リリース", () => {
    expect(at12().hiddenGap).toBe(0);
    expect(releaseOptions(at12({ doneWork: 98 })).map((o) => o.id)).toEqual(["auto"]);
    expect(releaseOptions(at12({ doneWork: 97 })).map((o) => o.id)).toEqual(["asis", "defer", "extend"]);
  });
  it("ごまかしの清算は残り 5% 超のときだけ", () => {
    expect(at12({ glossDebt: 2 }).trust.steering).toBe(36);
    expect(at12({ glossDebt: 1, doneWork: 96 }).trust.steering).toBe(60);
  });
  it("このまま／あとまわし／延期の効果", () => {
    const asis = applyRelease(at12(), "asis", fixedRng(0.99));
    expect(asis.outcome).toMatchObject({ incompleteRatio: 0.2, releaseTurn: 12 });
    expect(asis.status).toBe("finished");
    const defer = applyRelease(at12(), "defer", fixedRng(0.99));
    expect(defer.deferredScope).toBe(20);
    expect(defer.trust.ops).toBe(60 - (8 + 0.2 * 40));
    expect(defer.outcome?.incompleteRatio).toBe(0);
    const ext = startExtension(at12());
    expect(ext.pending).toMatchObject({ kind: "escalation", source: "release", types: ["extendSchedule"] });
    expect(releaseOptions(at12({ deadline: 14, turn: 14 })).find((o) => o.id === "extend")?.enabled).toBe(false);
  });
  it("正直に報告した回数ぶん steering +3", () => {
    expect(applyRelease(at12({ honestyCredit: 2 }), "asis", fixedRng(0.99)).trust.steering).toBe(66);
  });
  it("finalQuality と pIncident の式", () => {
    const s = baseState({ quality: 80, techDebt: 20 });
    expect(finalQualityOf(s, 0.1)).toBeCloseTo(80 - 6 - 6);
    expect(finalQualityOf({ ...s, quality: 5 }, 1)).toBe(0);
    expect(incidentChance(70, 2)).toBe(0.03);
    expect(incidentChance(40, 2)).toBeCloseTo(0.3);
    expect(incidentChance(40, 1)).toBeCloseTo(0.21);
    expect(incidentChance(40, 3)).toBeCloseTo(0.39);
    expect(incidentChance(-100, 3)).toBe(0.8);
  });
  it("障害が起きたら ops −20、steering −10", () => {
    const s = applyRelease(at12({ quality: 20 }), "asis", fixedRng(0));
    expect(s.outcome?.incident).toBe(true);
    expect(s.trust.ops).toBe(40);
    expect(s.outcome?.endingId).toBe("incident");
  });
  it("中止", () => {
    const s = finishCanceled(baseState());
    expect(s.outcome).toMatchObject({ canceled: true, endingId: "canceled" });
    expect(s.outcome?.grades.delivery).toBe("bad");
    expect(s.outcome?.grades.scope).toBe("bad");
  });
});

describe("評価の境目", () => {
  const g = (f: (v: number) => Grade, ...v: number[]) => v.map(f);
  it("大きいほど良い指標", () => {
    expect(g((v) => gradeUp(v, [80, 65, 45]), 80, 79, 65, 64, 45, 44)).toEqual(["great", "good", "good", "meh", "meh", "bad"]);
  });
  it("小さいほど良い指標", () => {
    expect(g((v) => gradeDown(v, [0.9, 1.0, 1.2]), 0.9, 0.91, 1.0, 1.01, 1.2, 1.21)).toEqual(["great", "good", "good", "meh", "meh", "bad"]);
    expect(g((v) => gradeDown(v, [0, 1, 2]), 0, 1, 2, 3)).toEqual(["great", "good", "meh", "bad"]);
  });
  it("6観点: 障害で品質が1段階下がる、予算切れは × ", () => {
    const s = baseState({ doneWork: 100, spent: 800, initialBudget: 1000 });
    const base = evaluate(s, { canceled: false, releaseTurn: 12, incident: false, finalQuality: 85 });
    expect(base).toMatchObject({ quality: "great", cost: "great", delivery: "great", scope: "great", stakeholders: "good" });
    expect(evaluate(s, { canceled: false, releaseTurn: 12, incident: true, finalQuality: 85 }).quality).toBe("good");
    expect(evaluate({ ...s, overBudget: true }, { canceled: false, releaseTurn: 12, incident: false, finalQuality: 85 }).cost).toBe("bad");
    expect(evaluate({ ...s, committedDeadline: 11 }, { canceled: false, releaseTurn: 12, incident: false, finalQuality: 85 }).delivery).toBe("good");
  });
});

describe("エンディングの優先順位", () => {
  const all = (grade: Grade): Outcome["grades"] => ({ quality: grade, cost: grade, delivery: grade, scope: grade, stakeholders: grade, team: grade });
  const o = (over: Partial<Outcome> = {}): Pick<Outcome, "canceled" | "incident" | "grades"> => ({ canceled: false, incident: false, grades: all("good"), ...over });
  const s = baseState();
  it("中止 > 障害 > みんなで束ねた", () => {
    expect(pickEnding(s, o({ canceled: true, incident: true }))).toBe("canceled");
    expect(pickEnding(s, o({ incident: true }))).toBe("incident");
    expect(pickEnding(s, o())).toBe("bundled");
  });
  it("その他", () => {
    expect(pickEnding({ ...s, departures: 1 }, o({ grades: { ...all("good"), scope: "meh" } }))).toBe("burnout");
    expect(pickEnding({ ...s, trust: { steering: 60, ops: 75, vendor: 50 } }, o({ grades: { ...all("good"), delivery: "meh" } }))).toBe("thanked");
    expect(pickEnding(s, o({ grades: { ...all("good"), scope: "meh" } }))).toBe("smallStart");
    expect(pickEnding({ ...s, skillUps: 3 }, o({ grades: { ...all("meh"), team: "great" } }))).toBe("grew");
    expect(pickEnding(s, o({ grades: all("meh") }))).toBe("managed");
  });
  it("チームの評価は在籍者で計算する", () => {
    const t = baseState({ members: [member("a", { morale: 80, fatigue: 70 }), member("b", { left: true, morale: 0 })], skillUps: 2, departures: 1 });
    expect(evaluate(t, { canceled: false, releaseTurn: 12, incident: false, finalQuality: 80 }).team).toBe("good"); // 80-20-20+10=50
  });
});
