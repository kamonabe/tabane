// 選択の前後の数字の変化や、話し手の絵を決める（結果カード用）
import { avg, rosterMembers } from "../game/derived";
import type { Expression, GameState } from "../game/types";
import { EVENT_TEXT } from "../text/events";
import { h, signed } from "./dom";

export interface DiffLine {
  label: string;
  delta: number;
  unit: string;
}

function summary(s: GameState) {
  const members = rosterMembers(s);
  return {
    steering: s.trust.steering, ops: s.trust.ops, vendor: s.trust.vendor, budget: s.budget, deadline: s.deadline,
    work: s.totalWork, clarity: s.clarity, morale: avg(members.map((m) => m.morale)), people: members.length,
  };
}

// 選択の前後で、画面に見える数字の変化を拾う
export function diffLines(a: GameState, b: GameState): DiffLine[] {
  const x = summary(a), y = summary(b);
  const defs: [keyof typeof x, string, string][] = [
    ["steering", "組織長の信頼", ""], ["ops", "運用担当さんの信頼", ""], ["vendor", "外注会社の信頼", ""],
    ["budget", "予算", "万円"], ["deadline", "締切", "ターン"], ["work", "つくる量", ""],
    ["clarity", "要件の固まり具合", "%"], ["morale", "チームの元気", ""], ["people", "メンバ", "人"],
  ];
  const out: DiffLine[] = [];
  for (const [key, label, unit] of defs) {
    const d = Math.round(y[key]) - Math.round(x[key]);
    if (d !== 0) out.push({ label, delta: d, unit });
  }
  return out;
}

export function speakerOf(s: GameState): { portraitId: string; expression: Expression } {
  const p = s.pending;
  if (p?.kind === "event") {
    const sp = EVENT_TEXT[p.eventId].speaker;
    if (sp === "member") return { portraitId: s.members.find((m) => m.id === p.targetId)?.portraitId ?? "pm", expression: "troubled" };
    return { portraitId: sp === "narrator" ? "pm" : sp, expression: "normal" };
  }
  if (p?.kind === "vendor") return { portraitId: "vendor", expression: "happy" };
  if (p?.kind === "release") return { portraitId: "ops", expression: "normal" };
  return { portraitId: "boss", expression: "normal" };
}


export function diffLineEl(l: DiffLine): HTMLElement {
  return h("li", { class: `diff ${l.delta > 0 ? "diff-up" : "diff-down"}` }, `${l.label} ${signed(l.delta)}${l.unit}`);
}
