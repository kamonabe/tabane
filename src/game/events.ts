// イベント（仕様書 7.4）
import {
  BUDGET_CUT_FREE_SHARE, BUDGET_CUT_MIN_FREE, BUDGET_CUT_RATE, EVENT_CHANCE, EVENT_CHANCE_MEETING, FATIGUE_HIGH, HELPER_TURNS,
  RATE_UP,
} from "./balance";
import {
  activeMembers, addLog, clamp, contractors, freeBudget, presentMembers, reportedDone, setTrust,
} from "./derived";
import { isMeetingTurn } from "./phases";
import { createMember, changeMorale, nextMemberId, pickName, pickTrait, makeSkills } from "./members";
import { chance, pick, weightedPick } from "./random";
import type { Rng } from "./random";
import { fillVars } from "../text/render";
import { EVENT_TEXT } from "../text/events";
import type { CoachSkill, EventId, GameState, Member, SkillKey } from "./types";

export const EVENT_IDS: EventId[] = [
  "opsRequest", "reqRework", "reqDropped", "memberSick", "quitRisk", "memberGrowth",
  "veteranHelp", "vendorRateUp", "memberSwap", "budgetCut", "bossPullIn", "bigBug",
];

export const GOOD_EVENTS: EventId[] = ["reqDropped", "memberGrowth", "veteranHelp"];

interface EventDef {
  weight: (s: GameState) => number; // 0 なら条件を満たさない
}

const times = (s: GameState, id: EventId) => s.eventCounts[id] ?? 0;
const inTurns = (s: GameState, a: number, b: number) => s.turn >= a && s.turn <= b;

// 成長イベントの対象になれる人
function growthCandidates(s: GameState): Member[] {
  return presentMembers(s).filter(
    (m) => (m.coachedCount >= 1 || m.archetype === "junior") && !s.onceFlags[`grown_${m.id}`],
  );
}

// 値上げや交代の話が出せる外注さん（もう参加していて、契約が続いている人）
export function vendorEventTargets(s: GameState): Member[] {
  return contractors(s).filter((m) => m.joinedTurn <= s.turn && m.leavesAfterTurn === null && m.awayTurns === 0);
}

export const EVENT_DEFS: Record<EventId, EventDef> = {
  opsRequest: { weight: (s) => (inTurns(s, 3, 11) && times(s, "opsRequest") < 3 ? 2 + s.profile.opsImpact : 0) },
  reqRework: { weight: (s) => (inTurns(s, 5, 11) && s.clarity < 90 ? (100 - s.clarity) / 10 : 0) },
  reqDropped: { weight: (s) => (inTurns(s, 5, 9) && !s.onceFlags.reqDropped ? (s.trust.ops >= 55 ? 2 : 0.5) : 0) },
  memberSick: { weight: () => 0 },
  quitRisk: { weight: () => 0 },
  memberGrowth: { weight: (s) => (growthCandidates(s).length > 0 ? 2 : 0) },
  veteranHelp: {
    weight: (s) => (inTurns(s, 5, 11) && !s.onceFlags.veteranHelp ? 1 + (s.trust.steering >= 60 ? 2 : 0) : 0),
  },
  vendorRateUp: {
    weight: (s) =>
      vendorEventTargets(s).length > 0 && inTurns(s, 4, 11) && times(s, "vendorRateUp") < 2 &&
      freeBudget(s) >= RATE_UP * Math.max(0, s.deadline - s.turn) // 払えない値上げの話は来ない
        ? 2 : 0,
  },
  memberSwap: {
    weight: (s) =>
      vendorEventTargets(s).length > 0 && inTurns(s, 4, 11) && !s.onceFlags.memberSwap ? 1 + (s.trust.vendor < 40 ? 3 : 0) : 0,
  },
  budgetCut: {
    weight: (s) => (inTurns(s, 4, 10) && !s.onceFlags.budgetCut && freeBudget(s) >= BUDGET_CUT_MIN_FREE ? 1 : 0),
  },
  bossPullIn: { weight: (s) => (inTurns(s, 5, 8) && !s.onceFlags.bossPullIn && s.deadline === 12 ? 1 : 0) },
  bigBug: {
    weight: (s) => (s.turn >= 10 && times(s, "bigBug") < 2 ? 0.3 + s.techDebt / 20 + (100 - s.quality) / 30 : 0),
  },
};

export interface RolledEvent {
  eventId: EventId;
  targetId: string | null;
}

// 優先イベント（体調不良・離職の相談）の確率。条件外なら 0
export function sickChance(m: Member | undefined): number {
  return m && m.fatigue >= FATIGUE_HIGH ? (m.fatigue - 70) / 100 : 0;
}

export function rollEvent(s: GameState, rng: Rng): RolledEvent | null {
  const active = activeMembers(s);
  // 1. 優先イベント
  const tired = [...active].sort((a, b) => b.fatigue - a.fatigue)[0];
  if (tired && sickChance(tired) > 0 && chance(rng, sickChance(tired))) return { eventId: "memberSick", targetId: tired.id };
  const gloomy = [...active].sort((a, b) => a.morale - b.morale)[0];
  if (gloomy && gloomy.morale < 25 && chance(rng, 0.5)) return { eventId: "quitRisk", targetId: gloomy.id };
  // 2. ランダムイベント
  if (s.turn < 2) return null;
  if (!chance(rng, isMeetingTurn(s.turn) ? EVENT_CHANCE_MEETING : EVENT_CHANCE)) return null;
  const items = EVENT_IDS.filter((id) => id !== s.lastEventId).map((id) => ({ item: id, weight: EVENT_DEFS[id].weight(s) }));
  if (items.every((i) => i.weight <= 0)) return null;
  const eventId = weightedPick(rng, items);
  let targetId: string | null = null;
  if (eventId === "memberGrowth") targetId = pick(rng, growthCandidates(s)).id;
  if (eventId === "vendorRateUp" || eventId === "memberSwap") targetId = pick(rng, vendorEventTargets(s)).id;
  return { eventId, targetId };
}

export function startEvent(s: GameState, ev: RolledEvent): void {
  s.status = "event";
  s.pending = { kind: "event", eventId: ev.eventId, targetId: ev.targetId };
  s.eventCounts[ev.eventId] = (s.eventCounts[ev.eventId] ?? 0) + 1;
  s.lastEventId = ev.eventId;
}

export function eventTarget(s: GameState): Member | undefined {
  const p = s.pending;
  return p?.kind === "event" && p.targetId ? s.members.find((m) => m.id === p.targetId) : undefined;
}

export function eventChoiceEnabled(s: GameState, eventId: EventId, index: number): { ok: boolean; reason?: string } {
  if (eventId === "bigBug" && index === 2 && s.deadline >= 14) return { ok: false, reason: "これ以上は延ばせません" };
  return { ok: true };
}

function growthSkill(m: Member): SkillKey | null {
  const keys: SkillKey[] = ["design", "build", "test", "domain", "coord"];
  const preferred: CoachSkill = m.lastCoachedSkill ?? "build";
  if (m.skills[preferred] < 5) return preferred;
  const rest = keys.filter((k) => m.skills[k] < 5).sort((a, b) => m.skills[a] - m.skills[b]);
  return rest[0] ?? null;
}

const SKILL_NAME: Record<SkillKey, string> = {
  design: "設計", build: "実装", test: "テスト", domain: "業務知識", coord: "調整力",
};

function shrinkWork(s: GameState, ratio: number): void {
  s.totalWork = Math.max(Math.ceil(reportedDone(s)), Math.round(s.totalWork * (1 - ratio)));
}

// イベントの選択肢を適用する。choice は 0 始まり
export function applyEventChoice(state: GameState, choice: number, rng: Rng): GameState {
  const p = state.pending;
  if (!p || p.kind !== "event") return state;
  if (!eventChoiceEnabled(state, p.eventId, choice).ok) return state;
  const s = structuredClone(state);
  const text = EVENT_TEXT[p.eventId];
  const t = s.members.find((m) => m.id === p.targetId);
  const vars = { name: t?.name ?? "" };
  const turn = s.turn;
  s.pending = null;
  let result = text.choices[choice]?.result ?? "";
  const others = () => presentMembers(s);

  switch (p.eventId) {
    case "opsRequest":
      if (choice === 0) {
        s.totalWork += Math.round(s.originalTotalWork * 0.1);
        setTrust(s, "ops", 8);
      } else if (choice === 1) {
        s.nextTurnApPenalty += 1;
        setTrust(s, "ops", -1);
      } else setTrust(s, "ops", -10);
      break;
    case "reqRework":
      if (choice === 0) {
        s.totalWork += Math.round((100 - s.clarity) / 5);
        setTrust(s, "ops", 3);
        s.clarity = clamp(s.clarity + 5, 0, 100);
      } else {
        setTrust(s, "ops", -6);
        s.quality = clamp(s.quality - 3, 0, 100);
      }
      break;
    case "reqDropped":
      shrinkWork(s, 0.08);
      setTrust(s, "ops", 2);
      s.onceFlags.reqDropped = true;
      break;
    case "memberSick":
      if (t) {
        if (choice === 0) {
          t.awayTurns = 2;
          t.fatigue = 10;
          changeMorale(t, 10);
        } else {
          t.awayTurns = 1;
          t.fatigue = 50;
          changeMorale(t, -10);
        }
      }
      break;
    case "quitRisk":
      if (t) {
        if (choice === 0) {
          s.nextTurnApPenalty += 1;
          changeMorale(t, 30);
          t.mode = "normal";
        } else if (choice === 1) {
          if (chance(rng, 0.5)) {
            t.leavesAfterTurn = turn;
            s.departures += 1;
            result = `「…やっぱり、むずかしいです」。${t.name}さんは、次のターンからチームを離れることに。`;
          } else {
            changeMorale(t, 5);
            result = `「…わかりました、もう少しやってみます」。${t.name}さんは、なんとか踏みとどまってくれた。`;
          }
        } else {
          t.leavesAfterTurn = turn;
          s.departures += 1;
          for (const m of others()) if (m.id !== t.id) changeMorale(m, -3);
        }
      }
      break;
    case "memberGrowth":
      if (t) {
        const k = growthSkill(t);
        if (k) {
          t.skills[k] += 1;
          s.skillUps += 1;
          result = `${t.name}さんの${SKILL_NAME[k]}が伸びた！ ${result}`;
        }
        s.onceFlags[`grown_${t.id}`] = true;
        if (choice === 0) for (const m of others()) changeMorale(m, 4);
        else changeMorale(t, 12);
      }
      break;
    case "veteranHelp":
      s.onceFlags.veteranHelp = true;
      if (choice === 0) {
        const name = pickName(rng, s.members.map((m) => m.name));
        const h = createMember({
          id: nextMemberId(s.members), name, employment: "helper", archetype: "veteran",
          skills: { design: 4, build: 4, test: 4, domain: 4, coord: 4 }, morale: 70, fatigue: 0, trait: "careful",
          joinedTurn: turn + 1,
        });
        h.leavesAfterTurn = turn + HELPER_TURNS;
        s.members.push(h);
        result = `${name}さん（助っ人）が、次のターンから${HELPER_TURNS}ターンだけ加わる。心強い！`;
      } else setTrust(s, "steering", 2);
      break;
    case "vendorRateUp":
      if (t) {
        if (choice === 0) {
          t.ratePerTurn += RATE_UP;
          setTrust(s, "vendor", 6);
        } else if (choice === 1) {
          const p2 = s.trust.vendor / 100 + 0.2 + (s.turnsSinceVendorTalk <= 1 ? 0.1 : 0);
          if (chance(rng, p2)) {
            t.ratePerTurn += 5;
            setTrust(s, "vendor", -2);
            result = "交渉してみたら、「それなら少しだけで」と小さな値上げで済んだ。";
          } else {
            t.ratePerTurn += RATE_UP;
            setTrust(s, "vendor", -4);
            result = "交渉はうまくいかず、結局そのまま値上げ。相手の印象も少し悪くなった。";
          }
        } else {
          t.leavesAfterTurn = turn;
          setTrust(s, "vendor", -5);
        }
      }
      break;
    case "memberSwap":
      if (t) {
        t.left = true;
        const archetype = pick(rng, ["mid", "junior"] as const);
        const name = pickName(rng, s.members.map((m) => m.name));
        const m = createMember({
          id: nextMemberId(s.members), name, employment: "contractor", archetype, skills: makeSkills(rng, archetype),
          morale: 60, fatigue: 10, trait: pickTrait(rng), ratePerTurn: t.ratePerTurn, joinedTurn: turn + 1,
        });
        if (choice === 0) s.nextTurnApPenalty += 1;
        else {
          m.rampTurns = 2;
          s.hiddenGap += 5;
        }
        s.members.push(m);
        result = `${name}さんが次のターンから加わる。${result}`;
      }
      s.onceFlags.memberSwap = true;
      break;
    case "budgetCut":
      {
        // 使っていない分から、最大でも半分まで
        const cut = Math.min(
          Math.round(s.initialBudget * BUDGET_CUT_RATE), Math.round(Math.max(0, freeBudget(s)) * BUDGET_CUT_FREE_SHARE),
        );
        s.budget -= cut;
        s.approvedBudget -= cut;
        s.budgetCutAmount += cut;
      }
      s.onceFlags.budgetCut = true;
      if (choice === 0) for (const m of others()) changeMorale(m, -3);
      else if (choice === 1) s.nextTurnApPenalty += 1;
      else s.secretNewsTurn = turn + 2;
      break;
    case "bossPullIn":
      s.onceFlags.bossPullIn = true;
      if (choice === 0) {
        s.deadline -= 1;
        s.committedDeadline -= 1;
        setTrust(s, "steering", 10);
      } else if (choice === 1) {
        if (s.turn - s.lastReviewTurn <= 1) result = "組織長「なるほど、数字で言われると納得だ」。信頼は変わらず。";
        else {
          setTrust(s, "steering", -6);
          result = "組織長「根拠がちょっと弱いなあ…」。うまく説明できなかった。";
        }
      } else {
        s.deadline -= 1;
        s.committedDeadline -= 1;
        shrinkWork(s, 0.12);
        setTrust(s, "ops", -5);
        setTrust(s, "steering", 5);
      }
      break;
    case "bigBug":
      if (choice === 0) {
        s.totalWork += 10;
        s.quality = clamp(s.quality + 5, 0, 100);
      } else if (choice === 1) {
        setTrust(s, "ops", -8);
        s.quality = clamp(s.quality - 4, 0, 100);
      } else {
        s.totalWork += 10;
        s.nextTurnApPenalty += 1;
        s.pending = { kind: "escalation", source: "bigBug", types: ["extendSchedule"] };
        result = "延期を、組織長に相談してみることにした。";
      }
      break;
  }
  s.lastResult = fillVars(result, vars);
  addLog(s, p.eventId, fillVars(text.log, vars));
  return s;
}
