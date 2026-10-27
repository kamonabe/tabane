// 派生値（仕様書 2.1）。すべて純関数。
import type { GameState, Member } from "./types";
import { phaseOf, plannedFrac } from "./phases";

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function currentPhase(s: GameState) {
  return phaseOf(s.turn, s.deadline);
}

export function reportedDone(s: GameState): number {
  return s.doneWork + s.hiddenGap;
}

export function uncertaintyLeft(s: GameState): number {
  const phase = currentPhase(s);
  if (phase === "test" || phase === "release") return 0;
  return clamp((100 - s.clarity) / Math.max(1, 100 - s.initialClarity), 0, 1);
}

// 画面と上の人が見ている総量
export function displayedTotal(s: GameState): number {
  return Math.round(s.totalWork * (1 + s.estimateBias * uncertaintyLeft(s)));
}

export function reportedFrac(s: GameState): number {
  return Math.min(1, reportedDone(s) / Math.max(1, displayedTotal(s)));
}

export function actualFrac(s: GameState): number {
  return s.doneWork / Math.max(1, s.totalWork);
}

export function plannedFracNow(s: GameState): number {
  return plannedFrac(s.turn, s.deadline);
}

// 正 = 遅れ。ターン5以降のみ意味を持つ
export function behind(s: GameState): number {
  if (s.turn < 5) return 0;
  return plannedFracNow(s) - reportedFrac(s);
}

export function isActive(m: Member, turn: number): boolean {
  return !m.left && m.awayTurns === 0 && m.joinedTurn <= turn;
}

export function activeMembers(s: GameState): Member[] {
  return s.members.filter((m) => isActive(m, s.turn));
}

// 在籍している（抜けていない、参加済み）メンバ
export function presentMembers(s: GameState): Member[] {
  return s.members.filter((m) => !m.left && m.joinedTurn <= s.turn);
}

export function rosterMembers(s: GameState): Member[] {
  return s.members.filter((m) => !m.left);
}

export function contractors(s: GameState): Member[] {
  return s.members.filter((m) => !m.left && m.employment === "contractor");
}

export function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function qualityLabel(q: number): string {
  return q >= 75 ? "いい感じ" : q >= 55 ? "ふつう" : q >= 35 ? "ちょっと心配" : "あやしい";
}

export function debtLabel(d: number): string {
  return d <= 15 ? "すっきり" : d <= 35 ? "ちらほら" : d <= 60 ? "たまってきた" : "ずっしり";
}

export function uncertaintyLabel(u: number): string {
  return u >= 55 ? "大きい" : u >= 35 ? "ふつう" : "小さい";
}

// 出てきた用語IDを出てきた順に記録する（UI から呼ぶ）
export function markTermsSeen(s: GameState, ids: string[]): GameState {
  const fresh = ids.filter((id, i) => !s.seenTerms.includes(id) && ids.indexOf(id) === i);
  if (fresh.length === 0) return s;
  return { ...s, seenTerms: [...s.seenTerms, ...fresh] };
}

export function addLog(s: GameState, kind: string, text: string, important = true): void {
  s.log.push({ turn: s.turn, kind, text, important });
}

// 初回だけ important にしたいログ用
export function addLogFirstImportant(s: GameState, kind: string, text: string): void {
  const seen = s.log.some((l) => l.kind === kind);
  addLog(s, kind, text, !seen);
}

export function hasNemawashi(s: GameState): boolean {
  return s.plan.some((a) => a.kind === "nemawashi") || s.lastTurnNemawashi;
}

export function recentReview(s: GameState): boolean {
  return s.turn - s.lastReviewTurn <= 1;
}

export function setTrust(s: GameState, key: "steering" | "ops" | "vendor", delta: number): void {
  s.trust[key] = clamp(s.trust[key] + delta, 0, 100);
}
