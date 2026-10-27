import { describe, expect, it } from "vitest";
import { BEHIND_ONTRACK } from "./balance";
import { applyMeetingChoice, enterMeeting, meetingOptions } from "./meetings";
import { baseState } from "./testUtils";
import type { GameState } from "./types";

// turn 6: planned 0.25。申告 (doneWork/total)
const at6 = (done: number, over: Partial<GameState> = {}): GameState => {
  const s = baseState({ turn: 6, doneWork: done, ...over });
  enterMeeting(s);
  return s;
};
const ids = (s: GameState) => meetingOptions(s).map((o) => o.id);

describe("meetings", () => {
  it("behind の境目 BEHIND_ONTRACK（0.02）で選択肢が切り替わる", () => {
    expect(BEHIND_ONTRACK).toBe(0.02);
    expect(ids(at6(23))).toEqual(["onTrack_plain", "onTrack_shared"]); // 0.25-0.23=0.02
    expect(ids(at6(22))).toEqual(["behind_honest", "behind_recovery", "behind_gloss"]);
  });
  it("リカバリ案はレビュー直近か根回しが条件", () => {
    const find = (s: GameState) => meetingOptions(s).find((o) => o.id === "behind_recovery")!;
    expect(find(at6(0)).enabled).toBe(false);
    expect(find(at6(0, { lastReviewTurn: 5 })).enabled).toBe(true);
    expect(find(at6(0, { lastTurnNemawashi: true })).enabled).toBe(true);
    expect(find(at6(0)).disabledReason).toContain("根拠");
  });
  it("選択の効果", () => {
    expect(applyMeetingChoice(at6(30), "onTrack_plain").trust.steering).toBe(65);
    const shared = applyMeetingChoice(at6(30), "onTrack_shared");
    expect([shared.trust.steering, shared.riskShared]).toEqual([63, true]);
    const honest = applyMeetingChoice(at6(0), "behind_honest");
    expect([honest.trust.steering, honest.honestyCredit]).toEqual([56, 1]);
    const gloss = applyMeetingChoice(at6(0), "behind_gloss");
    expect([gloss.trust.steering, gloss.glossDebt]).toEqual([65, 1]);
    const rec = applyMeetingChoice(at6(0, { lastReviewTurn: 6 }), "behind_recovery");
    expect(rec.trust.steering).toBe(62);
    expect(rec.pending).toMatchObject({ kind: "escalation", source: "recovery" });
  });
  it("ごまかしは次の会議で behind ≥ 0.10 なら −12×glossDebt、根回しで半分", () => {
    const s = at6(0, { glossDebt: 2, trust: { steering: 60, ops: 60, vendor: 50 } });
    expect(s.trust.steering).toBe(36);
    const n = at6(0, { glossDebt: 1, lastTurnNemawashi: true });
    expect(n.trust.steering).toBe(54);
    const quiet = at6(25, { glossDebt: 1 });
    expect(quiet.trust.steering).toBe(60);
  });
  it("根回し済みなら正直な報告の減少も半分", () => {
    expect(applyMeetingChoice(at6(0, { lastTurnNemawashi: true }), "behind_honest").trust.steering).toBe(58);
  });
  it("steering ≤ 10 で中止", () => {
    const s = at6(0, { trust: { steering: 14, ops: 60, vendor: 50 } });
    expect(applyMeetingChoice(s, "behind_honest").onceFlags.canceled).toBe(true);
  });
  it("キックオフ: 3択、再見積もりの約束と再見積もり報告", () => {
    const k = baseState({ turn: 2 });
    enterMeeting(k);
    expect(ids(k)).toHaveLength(3);
    const r = applyMeetingChoice(k, "kickoff_reestimate");
    expect([r.reestimatePromised, r.trust.steering]).toEqual([true, 62]);
    expect(ids(at6(0, { reestimatePromised: true }))).toContain("reestimate_report");
    expect(applyMeetingChoice(k, "kickoff_ok").trust.steering).toBe(66);
    expect(applyMeetingChoice(k, "kickoff_consult").pending).toMatchObject({ source: "kickoff" });
  });
});
