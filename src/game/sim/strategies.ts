// テスト用の自動プレイ。バランスの確認（balance.test.ts）と、仕様書 11.3.7 の遊び方に使う。
// 結末の良し悪しは、ゲーム自身の結末（outcome.endingId）だけで測る。
import { addAction, canAddAction, setMode } from "../actions";
import { BEHIND_ONTRACK } from "../balance";
import { activeMembers, behind, contractors } from "../derived";
import { availability } from "../escalation";
import {
  chooseEvent, chooseMeeting, chooseRelease, chooseVendor, dropEscalation, endTurn, negotiateVendor, submitEscalation,
} from "../flow";
import { meetingOptions } from "../meetings";
import { isMeetingTurn } from "../phases";
import { createRng } from "../random";
import type { Rng } from "../random";
import { releaseOptions, remainingRatio } from "../release";
import { createInitialState } from "../setup";
import type { EscalationType, EventId, GameState, Member } from "../types";

export interface Strategy {
  name: string;
  plan(s: GameState): GameState; // ターン中の働き方と行動を決める
  turnEscalation?(s: GameState): EscalationType | null; // ターン画面から上申するなら、その種類（plan の前に呼ぶ）
  meeting(s: GameState): string;
  event(s: GameState, eventId: EventId): number;
  escalation(s: GameState, types: EscalationType[]): EscalationType | null;
  vendor(s: GameState): { negotiate: boolean; index: number | null };
  release(s: GameState): "auto" | "asis" | "defer" | "extend";
}

function setAllModes(s: GameState, decide: (m: Member) => Member["mode"]): GameState {
  let t = s;
  for (const m of activeMembers(s)) t = setMode(t, m.id, decide(m));
  return t;
}

function tryAdd(s: GameState, a: Parameters<typeof addAction>[1]): GameState {
  return canAddAction(s, a).ok ? addAction(s, a) : s;
}

function fillHandsOn(s: GameState): GameState {
  let t = s;
  while (canAddAction(t, { kind: "handsOn" }).ok) t = addAction(t, { kind: "handsOn" });
  return t;
}

function firstEnabled(s: GameState, preferred: string[]): string {
  const opts = meetingOptions(s).filter((o) => o.enabled);
  for (const id of preferred) if (opts.some((o) => o.id === id)) return id;
  return opts[0].id;
}

function defaultRelease(s: GameState): "auto" | "asis" | "defer" | "extend" {
  const o = releaseOptions(s);
  return o.some((x) => x.id === "auto") ? "auto" : "asis";
}

// 雑: 全員ずっとがんばる、AP は全部手を動かす、ステコミはごまかす、要望は全部受ける
export const careless: Strategy = {
  name: "careless",
  plan: (s) => fillHandsOn(setAllModes(s, () => "push")),
  meeting: (s) => firstEnabled(s, ["onTrack_plain", "behind_gloss", "kickoff_ok"]),
  // 要望は全部受ける。体調不良や相談は「もう少しがんばって」、予算の話は黙っておく
  event: (_s, id) => (id === "quitRisk" ? 1 : id === "memberSick" ? 1 : id === "budgetCut" ? 2 : 0),
  escalation: () => null,
  vendor: () => ({ negotiate: false, index: null }),
  release: defaultRelease,
};

// 放置: 全員ふつう、AP は全部手を動かす、調整なし、正直に報告
export const passive: Strategy = {
  name: "passive",
  plan: (s) => fillHandsOn(setAllModes(s, () => "normal")),
  meeting: (s) => firstEnabled(s, ["onTrack_plain", "behind_honest", "kickoff_ok"]),
  event: () => 0,
  escalation: () => null,
  vendor: () => ({ negotiate: false, index: null }),
  release: defaultRelease,
};

function restAware(m: Member): Member["mode"] {
  return m.fatigue >= 60 || (m.mode === "rest" && m.fatigue > 30) ? "rest" : "normal";
}

// そこそこ: ふつう＋疲れたら休み、レビュー隔ターン、運用と3ターンおき、上申しない
export const mixed: Strategy = {
  name: "mixed",
  plan: (s0) => {
    let s = setAllModes(s0, restAware);
    if (s.turn >= 5 && s.turn - s.lastReviewTurn >= 2) s = tryAdd(s, { kind: "review" });
    if (s.turnsSinceOpsSync >= 2) s = tryAdd(s, { kind: "opsSync" });
    return fillHandsOn(s);
  },
  meeting: (s) => firstEnabled(s, ["onTrack_plain", "behind_honest", "kickoff_ok"]),
  event: (_s, id) => (id === "vendorRateUp" ? 0 : 0),
  escalation: () => null,
  vendor: () => ({ negotiate: false, index: null }),
  release: defaultRelease,
};

// 序盤の育成の対象（伸ばしやすいスキルと人）
function coachTarget(s: GameState): { memberId: string; skill: "build" | "design" | "test" | "domain" } | null {
  const cands = activeMembers(s)
    .filter((m) => m.employment === "staff" && canAddAction(s, { kind: "coach", memberId: m.id, skill: "build" }).ok)
    .sort((a, b) => a.skills.build - b.skills.build);
  const m = cands[0];
  if (!m) return null;
  const skill = m.skills.build <= m.skills.design ? "build" : "design";
  return { memberId: m.id, skill };
}

// バランスの上申の選び方。残りターンと遅れを見て、選べる種類の中から決める（見送りなら null）
function pickEscalation(s: GameState, types: EscalationType[]): EscalationType | null {
  const can = (t: EscalationType) => types.includes(t) && availability(s, t).ok;
  const rest = Math.max(0, s.deadline - s.turn);
  const late = behind(s);
  if (rest >= 6 && can("addStaff")) return "addStaff";
  if (late >= 0.06 && !s.replanned && can("extendSchedule")) return "extendSchedule";
  if (late >= 0.12 && can("cutScope")) return "cutScope";
  if (rest >= 4 && late >= 0.06 && can("addStaff")) return "addStaff";
  return null;
}

// バランス: 疲れたら休み、毎ターン何かしらチーム行動、序盤は育成、運用と2ターンおき、
// ステコミ前に根回し、キックオフで増員を相談し、遅れたらリカバリ案で上申
export const balanced: Strategy = {
  name: "balanced",
  plan: (s0) => {
    let s = setAllModes(s0, restAware);
    if (isMeetingTurn(s.turn)) s = tryAdd(s, { kind: "nemawashi" });
    if (s.turnsSinceOpsSync >= 1 || s.turn <= 4) s = tryAdd(s, { kind: "opsSync" });
    if (s.turn >= 5) s = tryAdd(s, { kind: "review" });
    if (contractors(s).length > 0 && s.turnsSinceVendorTalk >= 3) s = tryAdd(s, { kind: "vendorTalk" });
    const teamDone = s.plan.some((a) => a.kind === "review" || a.kind === "oneOnOne" || a.kind === "coach");
    if (!teamDone || s.turn <= 4) {
      const c = s.turn <= 6 ? coachTarget(s) : null;
      if (c) s = tryAdd(s, { kind: "coach", memberId: c.memberId, skill: c.skill });
      if (!s.plan.some((a) => a.kind === "review" || a.kind === "oneOnOne" || a.kind === "coach")) {
        const low = [...activeMembers(s)].sort((a, b) => a.morale - b.morale)[0];
        if (low) s = tryAdd(s, { kind: "oneOnOne", memberId: low.id });
      }
    }
    return fillHandsOn(s);
  },
  // 会議のないターンでも、遅れが見えたらその場で相談する
  turnEscalation: (s) =>
    isMeetingTurn(s.turn) || s.turn < 7 || s.turn > 10 || behind(s) < 0.06 ? null : pickEscalation(s, ["extendSchedule", "cutScope"]),
  meeting: (s) => {
    if (s.turn === 2) return "kickoff_consult";
    if (behind(s) > 0.05) return firstEnabled(s, ["behind_recovery", "behind_honest"]);
    return firstEnabled(s, ["onTrack_shared", "onTrack_plain"]);
  },
  event: (s, id) => {
    switch (id) {
      case "opsRequest": return behind(s) > 0.05 || s.turn >= 7 ? 1 : 0;
      case "vendorRateUp": return 1;
      case "bossPullIn": return 1;
      case "bigBug": return s.turn >= s.deadline - 1 ? 1 : 0;
      default: return 0;
    }
  },
  escalation: (s, types) => pickEscalation(s, types),
  vendor: (s) => {
    const p = s.pending;
    return { negotiate: p?.kind === "vendor" && s.trust.vendor >= 50 && !p.negotiated, index: 1 }; // 中堅（候補の2番目）
  },
  release: (s) => {
    const o = releaseOptions(s);
    if (o.some((x) => x.id === "auto")) return "auto";
    if (o.some((x) => x.id === "extend" && x.enabled) && remainingRatio(s) > 0.08) return "extend";
    return s.trust.ops >= 60 ? "defer" : "asis";
  },
};

// はじめての人: ふつうに気をつけるが、コツは知らない。人間の初回プレイの代わり
export const firstTimer: Strategy = {
  name: "firstTimer",
  plan: (s0) => {
    let s = setAllModes(s0, restAware);
    if (s.turn >= 3 && s.turn - s.lastReviewTurn >= 2) s = tryAdd(s, { kind: "review" });
    if (s.turnsSinceOpsSync >= 1) s = tryAdd(s, { kind: "opsSync" });
    const low = [...activeMembers(s)].sort((a, b) => a.morale - b.morale)[0];
    if (low && low.morale < 50) s = tryAdd(s, { kind: "oneOnOne", memberId: low.id });
    return fillHandsOn(s);
  },
  meeting: (s) => {
    if (s.turn === 2) return "kickoff_consult";
    if (behind(s) > BEHIND_ONTRACK) return firstEnabled(s, ["behind_recovery", "behind_honest"]);
    return "onTrack_plain";
  },
  event: (_s, id) => (id === "opsRequest" ? 1 : 0), // 追加要望は「次の改善で」、ほかは最初の選択肢
  escalation: (s, types) => {
    const can = types.filter((t) => availability(s, t).ok);
    const pick = (t: EscalationType) => can.includes(t);
    if (s.turn <= 2 && pick("addStaff")) return "addStaff";
    if (!s.replanned && pick("extendSchedule")) return "extendSchedule";
    if (behind(s) > 0.05 && pick("cutScope")) return "cutScope";
    return can[0] ?? null;
  },
  vendor: () => ({ negotiate: false, index: 1 }), // 値下げ相談はせず、中堅を採用
  release: (s) => {
    const o = releaseOptions(s);
    if (o.some((x) => x.id === "auto")) return "auto";
    if (o.some((x) => x.id === "extend" && x.enabled) && remainingRatio(s) > 0.1) return "extend";
    return "defer";
  },
};

// 自動リリースか、一部あとまわし
const releaseWithoutExtension = (s: GameState): "auto" | "defer" => (releaseOptions(s).some((x) => x.id === "auto") ? "auto" : "defer");

// はじめての人と同じ行動で、上申だけしない
export const firstTimerNoEscalation: Strategy = {
  ...firstTimer,
  name: "firstTimerNoEscalation",
  meeting: (s) => {
    if (s.turn === 2) return "kickoff_ok";
    if (behind(s) > BEHIND_ONTRACK) return "behind_honest";
    return "onTrack_plain";
  },
  escalation: () => null,
  release: releaseWithoutExtension,
};

// はじめての人で、増員はキックオフの相談だけ（増員それだけの価値を測る）
export const firstTimerHireOnly: Strategy = {
  ...firstTimer,
  name: "firstTimerHireOnly",
  meeting: (s) => firstEnabled(s, ["kickoff_consult", "behind_honest", "onTrack_plain"]),
  release: releaseWithoutExtension,
};

// バランスから根回しと上申（キックオフの相談も含む）を抜いたもの。上申が効いていることの確認用
export const balancedNoEscalation: Strategy = {
  ...balanced,
  name: "balancedNoEscalation",
  plan: (s0) => {
    const planned = balanced.plan(s0);
    // 根回しだけ外した計画を作り直す（AP は手を動かすで埋める）
    let s = s0;
    for (const m of activeMembers(s0)) s = setMode(s, m.id, restAware(m));
    for (const a of planned.plan) {
      if (a.kind === "nemawashi" || a.kind === "handsOn") continue;
      s = tryAdd(s, a);
    }
    return fillHandsOn(s);
  },
  meeting: (s) => {
    if (s.turn === 2) return "kickoff_ok";
    if (behind(s) > 0.05) return firstEnabled(s, ["behind_honest"]);
    return firstEnabled(s, ["onTrack_shared", "onTrack_plain"]);
  },
  escalation: () => null,
  turnEscalation: () => null,
  release: (s) => (releaseOptions(s).some((x) => x.id === "auto") ? "auto" : s.trust.ops >= 60 ? "defer" : "asis"),
};

// 毎ターンレビューするが、根回しも上申もしない（レビューだけで全部解決できないことの確認用）
export const reviewEveryTurnNoEscalation: Strategy = {
  ...balancedNoEscalation,
  name: "reviewEveryTurnNoEscalation",
  plan: (s0) => {
    let s = s0;
    for (const m of activeMembers(s0)) s = setMode(s, m.id, restAware(m));
    if (s.turn >= 3) s = tryAdd(s, { kind: "review" });
    if (s.turnsSinceOpsSync >= 1 || s.turn <= 4) s = tryAdd(s, { kind: "opsSync" });
    return fillHandsOn(s);
  },
};

export const STRATEGIES: Record<string, Strategy> = {
  careless, passive, mixed, firstTimer, firstTimerNoEscalation, firstTimerHireOnly,
  balanced, balancedNoEscalation, reviewEveryTurnNoEscalation,
};

// 最後まで自動プレイする。同じ seed と戦略なら結果は同じ
export function playGame(seed: number, strategy: Strategy): GameState {
  const rng: Rng = createRng(seed ^ 0x5bd1e995);
  let s = createInitialState(seed);
  for (let guard = 0; guard < 600 && s.status !== "finished"; guard++) {
    const p = s.pending;
    if (!p) {
      if (s.status !== "playing") throw new Error(`stuck: status=${s.status}`);
      if (!s.escalatedThisTurn && strategy.turnEscalation) {
        const t = strategy.turnEscalation(s);
        if (t && availability(s, t).ok) {
          const next = submitEscalation(s, t, "prepared", rng);
          if (next !== s) {
            s = next;
            continue;
          }
        }
        s = { ...s, escalatedThisTurn: true }; // このターンは見送り（次のターンで nextTurn が戻す）
      }
      s = endTurn(strategy.plan(s), rng);
      continue;
    }
    switch (p.kind) {
      case "meeting":
        s = chooseMeeting(s, strategy.meeting(s), rng);
        break;
      case "event": {
        let idx = strategy.event(s, p.eventId);
        if (p.eventId === "bigBug" && idx === 2 && s.deadline >= 14) idx = 0;
        s = chooseEvent(s, idx, rng);
        break;
      }
      case "escalation": {
        const t = strategy.escalation(s, p.types);
        s = t ? submitEscalation(s, t, "prepared", rng) : dropEscalation(s, rng);
        break;
      }
      case "vendor": {
        const v = strategy.vendor(s);
        if (v.negotiate && !p.negotiated) s = negotiateVendor(s, rng);
        s = chooseVendor(s, v.index, rng);
        break;
      }
      case "release": {
        const choice = strategy.release(s);
        s = chooseRelease(s, choice, rng);
        break;
      }
    }
  }
  if (s.status !== "finished") throw new Error("game did not finish");
  return s;
}
