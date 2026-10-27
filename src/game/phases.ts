import { MEETING_TURNS } from "./balance";
import type { Member, Phase } from "./types";

// ターンごとのフェーズ（仕様書 1.1）。延長・前倒しはテスト期間の長さだけが変わる
export function phaseOf(turn: number, deadline: number): Phase {
  if (turn >= deadline) return "release";
  if (turn <= 2) return "concept";
  if (turn <= 4) return "requirements";
  if (turn <= 6) return "design";
  if (turn <= 9) return "build";
  return "test";
}

export const PHASE_ORDER: Phase[] = ["concept", "requirements", "design", "build", "test", "release"];

export function isMeetingTurn(turn: number): boolean {
  return (MEETING_TURNS as readonly number[]).includes(turn);
}

// ターン t の終わり時点の計画の進み具合
export function plannedFrac(turn: number, deadline: number): number {
  const v = (turn - 4) / (deadline - 4);
  return Math.min(1, Math.max(0, v));
}

// メンバの仕事が向かう先で使うスキル値
export function phaseSkill(phase: Phase, m: Pick<Member, "skills">): number {
  switch (phase) {
    case "concept":
    case "requirements":
      return m.skills.domain;
    case "design":
      return m.skills.design;
    case "build":
      return m.skills.build;
    case "test":
    case "release":
      return (m.skills.build + m.skills.test) / 2;
  }
}

// 作業フェーズ（出力が doneWork に向かう）
export function isWorkPhase(phase: Phase): boolean {
  return phase !== "concept" && phase !== "requirements";
}
