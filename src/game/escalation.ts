// 上申（仕様書 6章）
import {
  ADD_BUDGET, CUT_SCOPE, CUT_SCOPE_OPS, CUT_SCOPE_OPS_WITH_SYNC, ESC_APPROVE, ESC_CONDITIONAL, ESC_COST,
  ESC_COUNT_PENALTY, ESC_FIRM_PENALTY, ESC_GLOSS_PENALTY, ESC_NEMAWASHI_BONUS, ESC_PREPARED_BONUS,
  ESC_RECOVERY_BONUS, ESC_REESTIMATE_BONUS, ESC_REJECT_TRUST, ESC_ROLL_SPREAD, EXTEND, GUIDE_FAIR, GUIDE_GOOD,
  MAX_DEADLINE, MAX_TEAM_SIZE,
} from "./balance";
import { behind, addLog, hasNemawashi, reportedDone, rosterMembers, setTrust } from "./derived";
import { openVendorModal } from "./vendor";
import { randomInt } from "./random";
import type { Rng } from "./random";
import type { EscalationSource, EscalationStyle, EscalationType, GameState } from "./types";

export const ESCALATION_TYPES: EscalationType[] = ["addStaff", "addBudget", "cutScope", "extendSchedule"];

export interface ScoreReason {
  label: string;
  value: number;
}

export interface ApprovalScore {
  score: number;
  reasons: ScoreReason[];
  guide: "good" | "fair" | "hard"; // 通りそう／五分五分／きびしそう
}

// その場所から開いた上申の説明スタイル。ターン画面以外は常に「準備した」扱い
export function effectiveStyle(source: EscalationSource, style: EscalationStyle): EscalationStyle {
  return source === "turn" ? style : "prepared";
}

export function availability(s: GameState, type: EscalationType): { ok: boolean; reason?: string } {
  switch (type) {
    case "addStaff":
      return rosterMembers(s).length >= MAX_TEAM_SIZE ? { ok: false, reason: "チームはもういっぱいです" } : { ok: true };
    case "addBudget":
      return { ok: true };
    case "cutScope":
      return s.turn < 3 ? { ok: false, reason: "ターン3から相談できます" } : { ok: true };
    case "extendSchedule":
      if (s.turn < 5) return { ok: false, reason: "ターン5から相談できます" };
      if (s.deadline >= MAX_DEADLINE) return { ok: false, reason: "これ以上は延ばせません" };
      return { ok: true };
  }
}

// 通りやすさ（乱数を除いた目安）と、その理由
export function approvalScore(
  s: GameState, type: EscalationType, style: EscalationStyle, source: EscalationSource,
): ApprovalScore {
  const st = effectiveStyle(source, style);
  const reasons: ScoreReason[] = [{ label: "組織長からの信頼", value: s.trust.steering }];
  const add = (label: string, value: number) => {
    if (value !== 0) reasons.push({ label, value });
  };
  add("根拠の資料をつくった ＋", st === "prepared" ? ESC_PREPARED_BONUS : 0);
  add("根回し済み ＋", hasNemawashi(s) ? ESC_NEMAWASHI_BONUS : 0);
  add(s.turn <= 2 ? "早い時期に相談 ＋" : "時期が遅い −", s.turn <= 2 ? 15 : s.turn <= 6 ? 0 : -10);
  switch (type) {
    case "addStaff":
      add("残り予算がきびしい −", s.budget < 100 * Math.max(0, s.deadline - s.turn) ? -15 : 0);
      break;
    case "addBudget":
      add("お金の相談は通りにくい −", -10);
      break;
    case "cutScope":
      add("範囲を減らす相談は通りやすい ＋", 5);
      break;
    case "extendSchedule":
      add("締切が動かしにくい −", s.profile.deadlineFirm ? -ESC_FIRM_PENALTY : 0);
      break;
  }
  if (type !== "cutScope" && s.turn >= 5) {
    const b = behind(s);
    if (b >= 0.1) add("実際に遅れている（裏付けあり） ＋", 10);
    else if (b <= 0) add("「順調」と言っていた −", -10);
  }
  add("リカバリ案つきの報告 ＋", source === "recovery" ? ESC_RECOVERY_BONUS : 0);
  add("再見積もりの約束を守った ＋", source === "reestimate" ? ESC_REESTIMATE_BONUS : 0);
  add("これまでの上申の回数 −", source === "reestimate" ? 0 : -ESC_COUNT_PENALTY * s.escalationCount);
  add("前に「順調」とごまかした −", s.glossDebt > 0 && type !== "cutScope" ? -ESC_GLOSS_PENALTY : 0);
  const score = reasons.reduce((a, r) => a + r.value, 0);
  return { score, reasons, guide: score >= GUIDE_GOOD ? "good" : score >= GUIDE_FAIR ? "fair" : "hard" };
}

export function outcomeOf(roll: number): "approved" | "conditional" | "rejected" {
  return roll >= ESC_APPROVE ? "approved" : roll >= ESC_CONDITIONAL ? "conditional" : "rejected";
}

export const BOSS_LINES = {
  approved: "わかった。そこまで考えてるなら任せるよ。",
  conditional: "全部は無理だけど、半分ならいいよ。",
  rejected: "うーん、今回は見送りで。もう少し様子を見せて。",
} as const;

// 承認・条件付き承認の効果を適用する
export function applyEscalation(s: GameState, type: EscalationType, outcome: "approved" | "conditional", rng: Rng): string {
  const full = outcome === "approved";
  switch (type) {
    case "addStaff":
      openVendorModal(s, rng, !full);
      return full ? "外注会社から、人を出してもらえることになった。" : "人を出してもらえる。ただし契約は3ターン限り。";
    case "addBudget": {
      const v = full ? ADD_BUDGET.approved : ADD_BUDGET.conditional;
      s.budget += v;
      s.budgetAdded += v;
      return `予算が ${v} 万円ふえた。`;
    }
    case "cutScope": {
      const want = Math.round(s.originalTotalWork * (full ? CUT_SCOPE.approved : CUT_SCOPE.conditional));
      const floor = Math.ceil(reportedDone(s));
      const next = Math.max(floor, s.totalWork - want);
      const cut = Math.max(0, s.totalWork - next);
      s.totalWork = next;
      s.scopeCutTotal += cut;
      setTrust(s, "ops", s.plan.some((a) => a.kind === "opsSync") ? CUT_SCOPE_OPS_WITH_SYNC : CUT_SCOPE_OPS);
      return `つくる範囲を減らせた（作業量 −${cut}）。運用担当さんには、あとで説明が必要かも。`;
    }
    case "extendSchedule": {
      const v = Math.min(full ? EXTEND.approved : EXTEND.conditional, MAX_DEADLINE - s.deadline);
      s.deadline += v;
      return `締切が ${v} ターン延びた。`;
    }
  }
}

// 上申する。ターン画面から開いた場合は AP を使い、その場で判定する。
// 会議・イベント・リリース判定から開いた場合は state.pending の escalation を閉じる。
export function escalate(state: GameState, type: EscalationType, style: EscalationStyle, rng: Rng): GameState {
  const s = structuredClone(state);
  const source: EscalationSource = s.pending?.kind === "escalation" ? s.pending.source : "turn";
  if (!availability(s, type).ok) return state;
  const st = effectiveStyle(source, style);
  if (source === "turn") {
    const cost = ESC_COST[st];
    if (s.status !== "playing" || s.escalatedThisTurn || s.apUsed + cost > s.apMax) return state;
    s.apUsed += cost;
    s.escalatedThisTurn = true;
  } else if (s.pending?.kind === "escalation" && !s.pending.types.includes(type)) {
    return state;
  }
  const { score } = approvalScore(s, type, st, source);
  const roll = score + randomInt(rng, -ESC_ROLL_SPREAD, ESC_ROLL_SPREAD);
  const outcome = outcomeOf(roll);
  s.escalations.push({ turn: s.turn, type, style: st, score, roll, outcome });
  if (source !== "reestimate") s.escalationCount += 1;
  if (s.pending?.kind === "escalation") s.pending = null;
  let text: string;
  if (outcome === "rejected") {
    setTrust(s, "steering", ESC_REJECT_TRUST);
    text = "今回は見送りになった。材料をそろえて、また相談しよう。";
  } else {
    text = applyEscalation(s, type, outcome, rng);
    // リリース判定から延期が通ったら、イベントのあとの流れ（次のターン）に戻す
    if (source === "release" && type === "extendSchedule") s.status = "event";
  }
  s.lastResult = `${BOSS_LINES[outcome]}\n${text}`;
  addLog(s, `escalation_${outcome}`, `${ESCALATION_LABEL[type]}を上申 → ${OUTCOME_LABEL[outcome]}`);
  return s;
}

// 上申をやめる（会議・イベント・リリース判定から開いたとき）
export function skipEscalation(state: GameState): GameState {
  if (state.pending?.kind !== "escalation") return state;
  const s = structuredClone(state);
  s.pending = null;
  s.lastResult = "今回は上申せずに進めることにした。";
  return s;
}

export const ESCALATION_LABEL: Record<EscalationType, string> = {
  addStaff: "人を増やしたい", addBudget: "予算を増やしたい", cutScope: "範囲を減らしたい", extendSchedule: "締切を延ばしたい",
};
const OUTCOME_LABEL = { approved: "承認", conditional: "条件付き承認", rejected: "却下" } as const;
