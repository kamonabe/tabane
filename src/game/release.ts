// リリース判定・評価・エンディング（仕様書 8章）
import {
  AUTO_RELEASE_RATIO, DEBT_QUALITY_PENALTY, DEFER_OPS_BASE, DEFER_OPS_PER_RATIO, GLOSS_PENALTY,
  GLOSS_REVEAL_RELEASE_RATIO, GRADE_COST, GRADE_DELIVERY, GRADE_QUALITY, GRADE_SCOPE, GRADE_STAKEHOLDERS, GRADE_TEAM,
  HONESTY_BONUS, INCIDENT_BASE, INCIDENT_MAX, INCIDENT_MIN, INCIDENT_OPS, INCIDENT_OPS_MULT, INCIDENT_STEERING,
  INCOMPLETE_QUALITY_PENALTY, MAX_DEADLINE,
} from "./balance";
import { addLog, avg, clamp, rosterMembers, setTrust } from "./derived";
import { chance } from "./random";
import type { Rng } from "./random";
import { processLeaves } from "./turn";
import type { EndingId, GameState, Grade, Outcome } from "./types";

export interface ReleaseOption {
  id: "auto" | "asis" | "defer" | "extend";
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

export function remainingRatio(s: GameState): number {
  return Math.max(0, s.totalWork - s.doneWork) / Math.max(1, s.totalWork);
}

// リリース判定に入る（deadline ターンの終わり）。申告のずれを全部公開し、ごまかしを清算する
export function enterRelease(s: GameState): void {
  s.status = "release";
  s.hiddenGap = 0;
  if (s.glossDebt > 0 && remainingRatio(s) > GLOSS_REVEAL_RELEASE_RATIO) {
    setTrust(s, "steering", -GLOSS_PENALTY * s.glossDebt);
    addLog(s, "glossRevealed", "リリース判定で、「順調」の報告が実は違ったことがばれた");
  }
  s.glossDebt = 0;
  const prev = s.pending?.kind === "release" ? s.pending.extensionTried : false;
  s.pending = { kind: "release", extensionTried: prev };
}

export function releaseOptions(s: GameState): ReleaseOption[] {
  if (remainingRatio(s) <= AUTO_RELEASE_RATIO) {
    return [{ id: "auto", label: "予定どおりリリースする！", enabled: true }];
  }
  const tried = s.pending?.kind === "release" && s.pending.extensionTried;
  const canExtend = s.deadline < MAX_DEADLINE && !tried;
  return [
    { id: "asis", label: "このままリリースする（足りないところは未完成のまま）", enabled: true },
    { id: "defer", label: "一部の機能をあとまわしにしてリリースする", enabled: true },
    {
      id: "extend", label: "延期を{joshin}する", enabled: canExtend,
      disabledReason: tried ? "すでに相談しました" : s.deadline >= MAX_DEADLINE ? "これ以上は延ばせません" : undefined,
    },
  ];
}

// 延期の上申を開く
export function startExtension(state: GameState): GameState {
  const o = releaseOptions(state).find((x) => x.id === "extend");
  if (state.pending?.kind !== "release" || !o?.enabled) return state;
  const s = structuredClone(state);
  s.pending = { kind: "escalation", source: "release", types: ["extendSchedule"] };
  return s;
}

export function gradeUp(value: number, thresholds: readonly [number, number, number]): Grade {
  return value >= thresholds[0] ? "great" : value >= thresholds[1] ? "good" : value >= thresholds[2] ? "meh" : "bad";
}

// 小さいほど良い指標
export function gradeDown(value: number, thresholds: readonly [number, number, number]): Grade {
  return value <= thresholds[0] ? "great" : value <= thresholds[1] ? "good" : value <= thresholds[2] ? "meh" : "bad";
}

const ORDER: Grade[] = ["bad", "meh", "good", "great"];
export const gradeRank = (g: Grade): number => ORDER.indexOf(g);
export const atLeast = (g: Grade, min: Grade): boolean => gradeRank(g) >= gradeRank(min);
const lower = (g: Grade): Grade => ORDER[Math.max(0, gradeRank(g) - 1)];

export function finalQualityOf(s: GameState, incompleteRatio: number): number {
  return clamp(s.quality - s.techDebt * DEBT_QUALITY_PENALTY - incompleteRatio * INCOMPLETE_QUALITY_PENALTY, 0, 100);
}

export function incidentChance(finalQuality: number, opsImpact: 1 | 2 | 3): number {
  return clamp(((INCIDENT_BASE - finalQuality) / 100) * INCIDENT_OPS_MULT[opsImpact], INCIDENT_MIN, INCIDENT_MAX);
}

export function teamScore(s: GameState): number {
  const roster = rosterMembers(s);
  const fatigue = avg(roster.map((m) => m.fatigue));
  return avg(roster.map((m) => m.morale)) - Math.max(0, fatigue - 50) - 20 * s.departures + 5 * s.skillUps;
}

export function evaluate(
  s: GameState, o: { canceled: boolean; releaseTurn: number; incident: boolean; finalQuality: number },
): Outcome["grades"] {
  const q = gradeUp(o.finalQuality, GRADE_QUALITY);
  return {
    quality: o.incident ? lower(q) : q,
    cost: s.overBudget ? "bad" : gradeDown(s.spent / Math.max(1, s.initialBudget), GRADE_COST),
    delivery: o.canceled ? "bad" : gradeDown(o.releaseTurn - s.committedDeadline, GRADE_DELIVERY),
    scope: o.canceled ? "bad" : gradeUp(Math.min(1, s.doneWork / Math.max(1, s.originalTotalWork)), GRADE_SCOPE),
    stakeholders: gradeUp((s.trust.steering + s.trust.ops) / 2, GRADE_STAKEHOLDERS),
    team: gradeUp(teamScore(s), GRADE_TEAM),
  };
}

export function pickEnding(s: GameState, o: Pick<Outcome, "canceled" | "incident" | "grades">): EndingId {
  const g = o.grades;
  if (o.canceled) return "canceled";
  if (o.incident) return "incident";
  if (Object.values(g).every((x) => atLeast(x, "good"))) return "bundled";
  if (atLeast(g.delivery, "good") && (g.team === "bad" || s.departures >= 1)) return "burnout";
  if (!atLeast(g.delivery, "good") && s.trust.ops >= 70 && atLeast(g.quality, "good")) return "thanked";
  if (!atLeast(g.scope, "good") && atLeast(g.quality, "good")) return "smallStart";
  if (g.team === "great" && s.skillUps >= 3) return "grew";
  return "managed";
}

function finish(s: GameState, outcome: Outcome): void {
  processLeaves(s);
  s.outcome = outcome;
  s.status = "finished";
  s.pending = null;
}

// ステコミで信頼が底をついたとき
export function finishCanceled(state: GameState): GameState {
  const s = structuredClone(state);
  s.hiddenGap = 0;
  const finalQuality = finalQualityOf(s, 0);
  const grades = evaluate(s, { canceled: true, releaseTurn: s.turn, incident: false, finalQuality });
  finish(s, {
    canceled: true, releaseTurn: s.turn, incident: false, finalQuality, incompleteRatio: 0, grades,
    endingId: "canceled",
  });
  s.lastResult = "ステコミで「いったん止めよう」と決まりました…。";
  addLog(s, "canceled", "ステコミで、プロジェクトの中止が決まった");
  return s;
}

// リリースの選択を適用して、結果を作る
export function applyRelease(state: GameState, id: "auto" | "asis" | "defer", rng: Rng): GameState {
  const opt = releaseOptions(state).find((o) => o.id === id);
  if (state.pending?.kind !== "release" || !opt?.enabled) return state;
  const s = structuredClone(state);
  const remaining = Math.max(0, s.totalWork - s.doneWork);
  const ratio = remainingRatio(s);
  let incompleteRatio = 0;
  if (id === "asis") incompleteRatio = ratio;
  if (id === "defer") {
    s.deferredScope = remaining;
    setTrust(s, "ops", -(DEFER_OPS_BASE + ratio * DEFER_OPS_PER_RATIO));
  }
  setTrust(s, "steering", HONESTY_BONUS * s.honestyCredit);

  const finalQuality = finalQualityOf(s, incompleteRatio);
  const incident = chance(rng, incidentChance(finalQuality, s.profile.opsImpact));
  if (incident) {
    setTrust(s, "ops", INCIDENT_OPS);
    setTrust(s, "steering", INCIDENT_STEERING);
    addLog(s, "incident", "リリース直後に{honbanShogai}が起きた");
  }
  const releaseTurn = s.turn;
  const grades = evaluate(s, { canceled: false, releaseTurn, incident, finalQuality });
  const outcome: Outcome = { canceled: false, releaseTurn, incident, finalQuality, incompleteRatio, grades, endingId: "managed" };
  outcome.endingId = pickEnding(s, outcome);
  addLog(s, "release", `ターン${releaseTurn}で{releaseJudge}を通り、リリースした`);
  finish(s, outcome);
  s.lastResult = incident ? "リリースした！ …けれど、すぐに電話が鳴りはじめた。" : "リリースした！ おつかれさま！";
  return s;
}
