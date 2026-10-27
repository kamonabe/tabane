// プレイヤーの行動の予約・取り消し・働き方の切り替え（仕様書 4章）
import {
  AP_BASE, AP_MEETING_COST, AP_SUPPORT_BONUS_MAX, COACH_LIMIT, HANDS_ON_MAX, SUPPORT_MIN_COORD,
} from "./balance";
import { isMeetingTurn } from "./phases";
import type { GameState, LeaderAction, Member, Mode } from "./types";

export type ActionKind = LeaderAction["kind"];

export const TEAM_ACTIONS: ActionKind[] = ["review", "oneOnOne", "coach"];
export const COORD_ACTIONS: ActionKind[] = ["opsSync", "nemawashi", "vendorTalk"];

export function isTeamAction(kind: ActionKind): boolean {
  return TEAM_ACTIONS.includes(kind);
}

export function actionCost(_a: LeaderAction): number {
  return 1;
}

// このターンの AP（働き方の調整サポートも反映）
export function computeApMax(s: GameState): number {
  const support = s.members.filter(
    (m) => !m.left && m.joinedTurn <= s.turn && m.awayTurns === 0 && m.mode === "support" && m.skills.coord >= SUPPORT_MIN_COORD,
  ).length;
  const ap = AP_BASE - (isMeetingTurn(s.turn) ? AP_MEETING_COST : 0) + Math.min(AP_SUPPORT_BONUS_MAX, support) - s.apPenalty;
  return Math.max(1, ap);
}

export function actionsUsedAp(plan: readonly LeaderAction[]): number {
  return plan.reduce((a, x) => a + actionCost(x), 0);
}

export function remainingAp(s: GameState): number {
  return s.apMax - s.apUsed;
}

function memberById(s: GameState, id: string): Member | undefined {
  return s.members.find((m) => m.id === id);
}

export function coachLimitOf(m: Member): number {
  return COACH_LIMIT[m.archetype];
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export function canAddAction(s: GameState, a: LeaderAction): Check {
  if (s.status !== "playing" || s.pending) return { ok: false, reason: "いまは行動できません" };
  if (s.apUsed + actionCost(a) > s.apMax) return { ok: false, reason: "リーダーの時間が足りません" };
  const count = (kind: ActionKind) => s.plan.filter((x) => x.kind === kind).length;
  switch (a.kind) {
    case "handsOn":
      if (count("handsOn") >= HANDS_ON_MAX) return { ok: false, reason: "手を動かせるのは1ターンに2回まで" };
      return { ok: true };
    case "review":
    case "opsSync":
    case "nemawashi":
    case "vendorTalk":
      if (count(a.kind) >= 1) return { ok: false, reason: "1ターンに1回まで" };
      return { ok: true };
    case "oneOnOne": {
      const m = memberById(s, a.memberId);
      if (!m || m.left || m.awayTurns > 0 || m.joinedTurn > s.turn) return { ok: false, reason: "この人とは今は話せません" };
      if (s.plan.some((x) => x.kind === "oneOnOne" && x.memberId === a.memberId)) {
        return { ok: false, reason: "同じ人とは1ターンに1回まで" };
      }
      return { ok: true };
    }
    case "coach": {
      const m = memberById(s, a.memberId);
      if (!m || m.left || m.awayTurns > 0 || m.joinedTurn > s.turn) return { ok: false, reason: "この人は今は育成できません" };
      if (count("coach") >= 1) return { ok: false, reason: "育成は1ターンに1回まで" };
      if (m.coachedCount >= coachLimitOf(m)) return { ok: false, reason: "この人の育成は上限です" };
      if (m.skills[a.skill] >= 5) return { ok: false, reason: "このスキルはもう最高です" };
      return { ok: true };
    }
  }
}

// 拒否されたときは、状態をそのまま返す
export function addAction(state: GameState, a: LeaderAction): GameState {
  if (!canAddAction(state, a).ok) return state;
  const s = structuredClone(state);
  s.plan.push(a);
  s.apUsed += actionCost(a);
  return s;
}

export function removeAction(state: GameState, index: number): GameState {
  if (index < 0 || index >= state.plan.length) return state;
  const s = structuredClone(state);
  const [a] = s.plan.splice(index, 1);
  s.apUsed -= actionCost(a);
  return s;
}

export function canSetMode(s: GameState, memberId: string, mode: Mode): Check {
  const m = memberById(s, memberId);
  if (!m || m.left || m.awayTurns > 0 || s.status !== "playing" || s.pending) return { ok: false, reason: "いまは切り替えられません" };
  const t = structuredClone(s);
  t.members.find((x) => x.id === memberId)!.mode = mode;
  if (computeApMax(t) < s.apUsed) return { ok: false, reason: "予定した行動があふれてしまいます" };
  return { ok: true };
}

export function setMode(state: GameState, memberId: string, mode: Mode): GameState {
  if (!canSetMode(state, memberId, mode).ok) return state;
  const s = structuredClone(state);
  s.members.find((m) => m.id === memberId)!.mode = mode;
  s.apMax = computeApMax(s);
  return s;
}
