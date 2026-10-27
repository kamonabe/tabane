// ステコミ（仕様書 7.1）
import { BEHIND_GLOSS_REVEAL, BEHIND_ONTRACK, CANCEL_STEERING, GLOSS_PENALTY } from "./balance";
import { addLog, behind, clamp, hasNemawashi, recentReview } from "./derived";
import type { GameState } from "./types";

export type MeetingKind = "kickoff" | "progress";

export interface MeetingOption {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  result: string;
}

export function meetingKindOf(s: GameState): MeetingKind {
  return s.turn === 2 ? "kickoff" : "progress";
}

// 組織長の信頼を動かす。根回し済みなら、減る分は半分
export function steeringDelta(s: GameState, delta: number): void {
  const d = delta < 0 && hasNemawashi(s) ? Math.ceil(delta / 2) : delta;
  s.trust.steering = clamp(s.trust.steering + d, 0, 100);
}

// 会議に入るときの前処理（ごまかしの清算）。清算したら true
export function enterMeeting(s: GameState): boolean {
  s.pending = { kind: "meeting", meeting: meetingKindOf(s) };
  if (s.turn === 2 || s.glossDebt <= 0 || behind(s) < BEHIND_GLOSS_REVEAL) return false;
  const base = -GLOSS_PENALTY * s.glossDebt;
  steeringDelta(s, s.riskShared ? Math.ceil(base / 2) : base);
  s.riskShared = false;
  s.glossDebt = 0;
  addLog(s, "glossRevealed", "前回「順調」と報告したのに遅れていて、組織長に気づかれた");
  return true;
}

export function meetingOptions(s: GameState): MeetingOption[] {
  if (meetingKindOf(s) === "kickoff") {
    return [
      { id: "kickoff_ok", label: "「この体制でいけます！」", enabled: true, result: "組織長「頼もしいね。期待してるよ」" },
      { id: "kickoff_consult", label: "「厳しいかもしれません。人か予算を相談させてください」", enabled: true, result: "組織長「ふむ、話を聞こうか」" },
      { id: "kickoff_reestimate", label: "「要件が固まったら、{mitsumori}をやり直させてください」", enabled: true, result: "組織長「わかった。固まったらまた教えて」" },
    ];
  }
  const out: MeetingOption[] = [];
  if (behind(s) <= BEHIND_ONTRACK) {
    out.push(
      { id: "onTrack_plain", label: "「順調です」と報告する", enabled: true, result: "組織長「いいね、その調子で」" },
      { id: "onTrack_shared", label: "「順調ですが、気になる点も共有します」", enabled: true, result: "組織長「先に言ってくれて助かるよ」" },
    );
  } else {
    const canRecover = recentReview(s) || hasNemawashi(s);
    out.push(
      { id: "behind_honest", label: "正直に遅れを報告する", enabled: true, result: "組織長「そうか…。早めに分かってよかったよ」" },
      {
        id: "behind_recovery", label: "リカバリ案をつけて報告する", enabled: canRecover,
        disabledReason: canRecover ? undefined : "根拠になる情報が足りない…（最近{review}していない）",
        result: "組織長「具体案があるなら、聞こう」",
      },
      { id: "behind_gloss", label: "「順調です」と言っておく", enabled: true, result: "組織長「そうか、順調ならよかった」…本当に大丈夫かな？" },
    );
  }
  if (s.turn === 6 && s.reestimatePromised) {
    out.push({ id: "reestimate_report", label: "{mitsumori}の結果を報告する", enabled: true, result: "組織長「約束どおりだね。聞かせて」" });
  }
  return out;
}

// 会議の選択を適用する。上申を開くものは pending を escalation にして返す
export function applyMeetingChoice(state: GameState, optionId: string): GameState {
  const opt = meetingOptions(state).find((o) => o.id === optionId);
  if (!opt || !opt.enabled || state.pending?.kind !== "meeting") return state;
  const s = structuredClone(state);
  s.pending = null;
  s.lastResult = opt.result;
  switch (optionId) {
    case "kickoff_ok":
      steeringDelta(s, 6);
      addLog(s, "meeting_kickoff", "キックオフで「この体制でいけます」と答えた");
      break;
    case "kickoff_consult":
      s.pending = { kind: "escalation", source: "kickoff", types: ["addStaff", "addBudget"] };
      addLog(s, "meeting_kickoff", "キックオフで、人か予算を相談した");
      break;
    case "kickoff_reestimate":
      steeringDelta(s, 2);
      s.reestimatePromised = true;
      addLog(s, "meeting_kickoff", "キックオフで、要件が固まったら見積もりをやり直すと約束した");
      break;
    case "onTrack_plain":
      steeringDelta(s, 5);
      addLog(s, "meeting_ontrack", "ステコミで「順調です」と報告した", false);
      break;
    case "onTrack_shared":
      steeringDelta(s, 3);
      s.riskShared = true;
      addLog(s, "meeting_ontrack", "ステコミで、順調だけど気になる点も共有した", false);
      break;
    case "behind_honest":
      steeringDelta(s, -4);
      s.honestyCredit += 1;
      addLog(s, "meeting_honest", "ステコミで、遅れを正直に報告した");
      break;
    case "behind_recovery":
      steeringDelta(s, 2);
      s.pending = { kind: "escalation", source: "recovery", types: ["addStaff", "addBudget", "cutScope", "extendSchedule"] };
      addLog(s, "meeting_recovery", "ステコミで、リカバリ案をつけて遅れを報告した");
      break;
    case "behind_gloss":
      steeringDelta(s, 5);
      s.glossDebt += 1;
      addLog(s, "meeting_gloss", "ステコミで、遅れているのに「順調です」と報告した");
      break;
    case "reestimate_report":
      s.pending = { kind: "escalation", source: "reestimate", types: ["addStaff", "addBudget", "cutScope", "extendSchedule"] };
      addLog(s, "meeting_recovery", "約束していた再見積もりの結果を報告した");
      break;
  }
  // 信頼が底をついたら、プロジェクトは中止になる（release.ts が結果を作る）
  if (s.trust.steering <= CANCEL_STEERING) {
    s.pending = null;
    s.status = "release";
    s.onceFlags["canceled"] = true;
  }
  return s;
}
