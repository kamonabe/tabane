import { describe, expect, it } from "vitest";
import { EVENT_DEFS, EVENT_IDS, applyEventChoice, eventChoiceEnabled, rollEvent, sickChance, startEvent, vendorEventTargets } from "./events";
import { baseState, fixedRng, member, rng } from "./testUtils";
import type { EventId, GameState } from "./types";

const w = (id: EventId, s: GameState) => EVENT_DEFS[id].weight(s);
const contractor = () => member("c", { employment: "contractor", ratePerTurn: 100 });
const open = (s: GameState, eventId: EventId, targetId: string | null = null): GameState => {
  const t = structuredClone(s);
  startEvent(t, { eventId, targetId });
  return t;
};

describe("イベントの条件", () => {
  it("ターン範囲・上限・一度きり", () => {
    const s = baseState({ clarity: 50 });
    expect([w("opsRequest", { ...s, turn: 2 }), w("opsRequest", { ...s, turn: 3 }), w("opsRequest", { ...s, turn: 11 }), w("opsRequest", { ...s, turn: 12 })]).toEqual([0, 4, 4, 0]);
    expect(w("opsRequest", { ...s, turn: 4, eventCounts: { opsRequest: 3 } })).toBe(0);
    expect(w("reqRework", { ...s, turn: 5 })).toBe(5);
    expect(w("reqRework", { ...s, turn: 5, clarity: 90 })).toBe(0);
    expect(w("reqDropped", { ...s, turn: 5 })).toBe(2);
    expect(w("reqDropped", { ...s, turn: 5, trust: { steering: 50, ops: 40, vendor: 50 } })).toBe(0.5);
    expect(w("reqDropped", { ...s, turn: 5, onceFlags: { reqDropped: true } })).toBe(0);
    expect(w("veteranHelp", { ...s, turn: 5 })).toBe(3);
    expect(w("veteranHelp", { ...s, turn: 12 })).toBe(0);
    expect(w("budgetCut", { ...s, turn: 3 })).toBe(0);
    expect(w("bossPullIn", { ...s, turn: 5 })).toBe(1);
    expect(w("bossPullIn", { ...s, turn: 5, deadline: 11 })).toBe(0);
    expect(w("bigBug", { ...s, turn: 9 })).toBe(0);
    expect(w("bigBug", { ...s, turn: 10, techDebt: 15, quality: 60 })).toBeCloseTo(0.3 + 15 / 20 + 40 / 30);
    expect(w("bigBug", { ...s, turn: 10, eventCounts: { bigBug: 2 } })).toBe(0);
  });
  it("外注がいるときだけ", () => {
    const s = baseState({ turn: 5 });
    expect(w("vendorRateUp", s)).toBe(0);
    expect(w("memberSwap", s)).toBe(0);
    const c = { ...s, members: [...s.members, contractor()] };
    expect(w("vendorRateUp", c)).toBe(2);
    expect(w("memberSwap", c)).toBe(1);
    expect(w("memberSwap", { ...c, trust: { steering: 50, ops: 50, vendor: 30 } })).toBe(4);
    expect(w("vendorRateUp", { ...c, eventCounts: { vendorRateUp: 2 } })).toBe(0);
    expect(w("memberSwap", { ...c, onceFlags: { memberSwap: true } })).toBe(0);
  });
  it("成長は育成済みか若手、1人1回", () => {
    const s = baseState();
    expect(w("memberGrowth", s)).toBe(0);
    expect(w("memberGrowth", { ...s, members: [member("a", { archetype: "junior" })] })).toBe(2);
    expect(w("memberGrowth", { ...s, members: [member("a", { coachedCount: 1 })], onceFlags: { grown_a: true } })).toBe(0);
  });
  it("直前と同じイベントは出ない", () => {
    const s = baseState({ turn: 5, clarity: 10, lastEventId: "reqRework", eventCounts: {} });
    s.onceFlags = { reqDropped: true, veteranHelp: true, budgetCut: true, bossPullIn: true };
    // 候補は opsRequest と reqRework だけだが、reqRework は直前なので除外
    for (let seed = 1; seed <= 50; seed++) {
      const ev = rollEvent(s, rng(seed));
      expect(ev === null || ev.eventId === "opsRequest").toBe(true);
    }
  });
  it("ステコミのターンは確率 0.3、通常 0.6（ターン1は起きない）", () => {
    const s = baseState({ turn: 5 });
    expect(rollEvent(s, fixedRng(0.59, 0, 0, 0))).not.toBeNull();
    expect(rollEvent(s, fixedRng(0.61, 0, 0, 0))).toBeNull();
    const m = baseState({ turn: 6 });
    expect(rollEvent(m, fixedRng(0.29, 0, 0, 0))).not.toBeNull();
    expect(rollEvent(m, fixedRng(0.31, 0, 0, 0))).toBeNull();
    expect(rollEvent(baseState({ turn: 1 }), fixedRng(0))).toBeNull();
  });
  it("優先イベント: 疲労 80 以上は (fatigue−70)/100、士気 25 未満は 0.5", () => {
    expect(sickChance(member("a", { fatigue: 79 }))).toBe(0);
    expect(sickChance(member("a", { fatigue: 90 }))).toBeCloseTo(0.2);
    const tired = baseState({ members: [member("a", { fatigue: 90 }), member("b")] });
    expect(rollEvent(tired, fixedRng(0.19))).toMatchObject({ eventId: "memberSick", targetId: "a" });
    expect(rollEvent(tired, fixedRng(0.21, 0.99, 0.99))).toBeNull();
    const gloomy = baseState({ members: [member("a", { morale: 20 }), member("b")] });
    expect(rollEvent(gloomy, fixedRng(0.49))).toMatchObject({ eventId: "quitRisk", targetId: "a" });
    expect(rollEvent(gloomy, fixedRng(0.5, 0.99))).toBeNull();
  });
  it("同じ seed と同じ状態なら同じイベント", () => {
    const s = baseState({ turn: 7, clarity: 50, members: [member("a"), contractor()] });
    for (let seed = 1; seed <= 20; seed++) expect(rollEvent(s, rng(seed))).toEqual(rollEvent(s, rng(seed)));
  });
  it("全イベントに文と選択肢がある", () => {
    for (const id of EVENT_IDS) expect(EVENT_DEFS[id]).toBeDefined();
  });
});

describe("選択肢の効果", () => {
  const s0 = () => baseState({ turn: 6, clarity: 60, members: [member("a"), member("b"), contractor()] });
  const pick = (id: EventId, choice: number, target: string | null = null, s = s0(), r = fixedRng(0)) => applyEventChoice(open(s, id, target), choice, r);

  it("E1 運用の要望", () => {
    expect(pick("opsRequest", 0)).toMatchObject({ totalWork: 110, trust: { ops: 68 } });
    const b = pick("opsRequest", 1);
    expect([b.nextTurnApPenalty, b.trust.ops]).toEqual([1, 59]);
    expect(pick("opsRequest", 2).trust.ops).toBe(50);
  });
  it("E2 思ってたのと違う", () => {
    const a = pick("reqRework", 0);
    expect([a.totalWork, a.trust.ops, a.clarity]).toEqual([108, 63, 65]);
    const b = pick("reqRework", 1);
    expect([b.trust.ops, b.quality]).toEqual([54, 57]);
  });
  it("E3 取り下げは reportedDone を下回らない", () => {
    expect(pick("reqDropped", 0).totalWork).toBe(92);
    const c = pick("reqDropped", 0, null, { ...s0(), doneWork: 96 });
    expect(c.totalWork).toBe(96);
    expect(c.scopeCutTotal).toBe(0);
  });
  it("E4 体調不良", () => {
    const a = pick("memberSick", 0, "a", { ...s0(), members: [member("a", { fatigue: 90 })] });
    expect([a.members[0].awayTurns, a.members[0].fatigue, a.members[0].morale]).toEqual([2, 10, 70]);
    const b = pick("memberSick", 1, "a");
    expect([b.members[0].awayTurns, b.members[0].fatigue, b.members[0].morale]).toEqual([1, 50, 50]);
  });
  it("E5 お話が…", () => {
    const a = pick("quitRisk", 0, "a", { ...s0(), members: [member("a", { mode: "push" }), member("b")] });
    expect([a.nextTurnApPenalty, a.members[0].morale, a.members[0].mode]).toEqual([1, 90, "normal"]);
    const stay = pick("quitRisk", 1, "a", s0(), fixedRng(0.9));
    expect([stay.members[0].morale, stay.departures]).toEqual([65, 0]);
    const go = pick("quitRisk", 1, "a", s0(), fixedRng(0.1));
    expect([go.members[0].leavesAfterTurn, go.departures]).toEqual([6, 1]);
    const t = pick("quitRisk", 2, "a");
    expect([t.departures, t.members[1].morale]).toEqual([1, 57]);
  });
  it("E6 成長", () => {
    const s = { ...s0(), members: [member("a", { lastCoachedSkill: "design" }), member("b")] };
    const a = pick("memberGrowth", 0, "a", s);
    expect([a.members[0].skills.design, a.skillUps, a.members[1].morale]).toEqual([4, 1, 64]);
    const b = pick("memberGrowth", 1, "a", s);
    expect([b.members[0].morale, b.members[1].morale]).toEqual([72, 60]);
    const capped = pick("memberGrowth", 0, "a", { ...s, members: [member("a", { lastCoachedSkill: "design", skills: { design: 5, build: 4, test: 3, domain: 2, coord: 5 } })] });
    expect(capped.members[0].skills.domain).toBe(3);
  });
  it("E7 助っ人", () => {
    const a = pick("veteranHelp", 0);
    const h = a.members[a.members.length - 1];
    expect([h.employment, h.joinedTurn, h.leavesAfterTurn, h.trait, h.skills.build]).toEqual(["helper", 7, 8, "careful", 4]);
    expect(pick("veteranHelp", 1).trust.steering).toBe(62);
  });
  it("E8 単価アップ", () => {
    expect(pick("vendorRateUp", 0, "c").members[2]).toMatchObject({ ratePerTurn: 115 });
    expect(pick("vendorRateUp", 0, "c").trust.vendor).toBe(56);
    const ok = pick("vendorRateUp", 1, "c", s0(), fixedRng(0.1));
    expect([ok.members[2].ratePerTurn, ok.trust.vendor]).toEqual([105, 48]);
    const ng = pick("vendorRateUp", 1, "c", s0(), fixedRng(0.99));
    expect([ng.members[2].ratePerTurn, ng.trust.vendor]).toEqual([115, 46]);
    const end = pick("vendorRateUp", 2, "c");
    expect([end.members[2].leavesAfterTurn, end.trust.vendor, end.departures]).toEqual([6, 45, 0]);
  });
  it("E9 入れ替え", () => {
    const a = pick("memberSwap", 0, "c");
    expect(a.members[2].left).toBe(true);
    expect(a.members[3]).toMatchObject({ rampTurns: 0, ratePerTurn: 100, joinedTurn: 7 });
    expect(a.nextTurnApPenalty).toBe(1);
    const b = pick("memberSwap", 1, "c");
    expect([b.members[3].rampTurns, b.hiddenGap]).toEqual([2, 5]);
  });
  it("E10 予算の見直し", () => {
    const a = pick("budgetCut", 0);
    expect([a.budget, a.members[0].morale]).toEqual([850, 57]);
    expect(pick("budgetCut", 1).nextTurnApPenalty).toBe(1);
    expect(pick("budgetCut", 2).secretNewsTurn).toBe(8);
  });
  it("E11 前倒し", () => {
    const a = pick("bossPullIn", 0);
    expect([a.deadline, a.committedDeadline, a.trust.steering]).toEqual([11, 11, 70]);
    expect(pick("bossPullIn", 1).trust.steering).toBe(54);
    expect(pick("bossPullIn", 1, null, { ...s0(), lastReviewTurn: 5 }).trust.steering).toBe(60);
    const c = pick("bossPullIn", 2);
    expect([c.deadline, c.totalWork, c.trust.ops, c.trust.steering]).toEqual([11, 88, 55, 65]);
  });
  it("E12 大きなバグ", () => {
    const a = pick("bigBug", 0);
    expect([a.totalWork, a.quality]).toEqual([110, 65]);
    const b = pick("bigBug", 1);
    expect([b.trust.ops, b.quality]).toEqual([52, 56]);
    const c = pick("bigBug", 2);
    expect(c.totalWork).toBe(110);
    expect(c.pending).toMatchObject({ kind: "escalation", source: "bigBug", types: ["extendSchedule"] });
    expect(eventChoiceEnabled({ ...s0(), deadline: 14 }, "bigBug", 2).ok).toBe(false);
    expect(eventChoiceEnabled(s0(), "bigBug", 2).ok).toBe(true);
  });
  it("選択は LogEntry を残し、一度きりのフラグを立てる", () => {
    const a = pick("budgetCut", 0);
    expect(a.log[a.log.length - 1]).toMatchObject({ kind: "budgetCut", important: true });
    expect(a.onceFlags.budgetCut).toBe(true);
    expect(a.eventCounts.budgetCut).toBe(1);
  });
  it("値上げ・交代の相手は、もう参加していて契約が続いている外注さんだけ", () => {
    const joined = member("a", { employment: "contractor", ratePerTurn: 100 });
    const notYet = member("b", { employment: "contractor", ratePerTurn: 100, joinedTurn: 9 });
    const leaving = member("c", { employment: "contractor", ratePerTurn: 100, leavesAfterTurn: 7 });
    const s = baseState({ turn: 6, members: [joined, notYet, leaving] });
    expect(vendorEventTargets(s).map((m) => m.id)).toEqual(["a"]);
    for (let i = 0; i < 20; i++) {
      const ev = rollEvent({ ...s, eventCounts: {}, lastEventId: null }, rng(i + 1));
      if (ev?.eventId === "vendorRateUp" || ev?.eventId === "memberSwap") expect(ev.targetId).toBe("a");
    }
    const none = baseState({ turn: 6, members: [notYet, leaving] });
    expect(w("vendorRateUp", none)).toBe(0);
    expect(w("memberSwap", none)).toBe(0);
  });
  it("終盤（ターン11）でも、大バグのほかに選べるイベントがある", () => {
    const s = baseState({ turn: 11, deadline: 12, clarity: 50, members: [member("a"), member("b"), member("c", { employment: "contractor", ratePerTurn: 100 })] });
    const eligible = EVENT_IDS.filter((id) => w(id, s) > 0);
    expect(eligible).toContain("bigBug");
    expect(eligible.filter((id) => id !== "bigBug").length).toBeGreaterThanOrEqual(3);
  });
});
