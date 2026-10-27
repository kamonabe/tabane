// テスト用の自動プレイ。バランスの確認（balance.test.ts）と、仕様書 11章の4つの遊び方に使う。
import { addAction, canAddAction, setMode } from "../actions";
import { activeMembers, behind, contractors, recentReview } from "../derived";
import { approvalScore, availability, hireAffordability } from "../escalation";
import {
  chooseEvent, chooseMeeting, chooseRelease, chooseVendor, dropEscalation, endTurn, negotiateVendor, submitEscalation,
} from "../flow";
import { meetingOptions } from "../meetings";
import { isMeetingTurn } from "../phases";
import { createRng } from "../random";
import type { Rng } from "../random";
import { releaseOptions, remainingRatio } from "../release";
import { createInitialState } from "../setup";
import { budgetCoverage } from "../vendor";
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

// バランス: 疲れたら休み、毎ターン何かしらチーム行動、序盤は育成、運用と2ターンおき、
// ステコミ前に根回し、遅れたらリカバリ案で上申
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
    // 遅れていて裏付けがあるときは、その場で上申する
    return fillHandsOn(s);
  },
  // 会議のないターンでも、遅れが見えたらその場で相談する
  turnEscalation: (s) => {
    if (isMeetingTurn(s.turn) || s.turn < 7 || s.turn > 9 || behind(s) < 0.06) return null;
    if (s.escalationCount === 0) return "cutScope";
    return s.escalationCount === 1 && hireAffordability(s) !== "none" ? "addStaff" : null;
  },
  meeting: (s) => {
    if (s.turn === 2) return firstEnabled(s, ["kickoff_reestimate", "kickoff_ok"]);
    if (behind(s) > 0.05) return firstEnabled(s, ["reestimate_report", "behind_recovery", "behind_honest"]);
    return firstEnabled(s, ["onTrack_shared", "onTrack_plain"]);
  },
  event: (s, id) => {
    switch (id) {
      case "opsRequest": return behind(s) > 0.05 || s.turn >= 7 ? 1 : 0;
      case "vendorRateUp": return 1;
      case "bossPullIn": return recentReview(s) ? 1 : 1;
      case "bigBug": return s.turn >= s.deadline - 1 ? 1 : 0;
      default: return 0;
    }
  },
  escalation: (s, types) => {
    const source = s.pending?.kind === "escalation" ? s.pending.source : "turn";
    let best: { t: EscalationType; v: number } | null = null;
    for (const t of types) {
      if (!availability(s, t).ok) continue;
      const rest = Math.max(0, s.deadline - s.turn);
      const late = behind(s);
      let value = approvalScore(s, t, "prepared", source).score;
      const afford = hireAffordability(s);
      if (t === "addStaff") value += (rest >= 3 ? 20 : -50) + (afford === "ok" ? 10 : afford === "tight" ? -10 : -60);
      if (t === "addBudget" && afford !== "ok" && rest >= 3) value += 35;
      if (t === "extendSchedule") value += late >= 0.15 && s.turn >= 8 ? 15 : -40;
      if (t === "addBudget") value -= 30;
      if (t === "cutScope") value += late >= 0.05 ? 15 : -25;
      if (!best || value > best.v) best = { t, v: value };
    }
    return best ? best.t : null;
  },
  vendor: (s) => {
    const rest = Math.max(0, s.deadline - s.turn);
    const p = s.pending;
    if (p?.kind !== "vendor" || rest < 3) return { negotiate: false, index: null };
    // 払いきれる候補のうち、いちばん力のある人（候補は veteran, mid, junior の順）
    const idx = [0, 1, 2].find((i) => budgetCoverage(s, p.candidates[i].member.ratePerTurn, p.conditional).enough);
    return { negotiate: s.trust.vendor >= 50 && !p.negotiated, index: idx ?? null };
  },
  release: (s) => {
    const o = releaseOptions(s);
    if (o.some((x) => x.id === "auto")) return "auto";
    if (o.some((x) => x.id === "extend" && x.enabled) && remainingRatio(s) > 0.08) return "extend";
    return s.trust.ops >= 60 ? "defer" : "asis";
  },
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
  careless, passive, mixed, balanced, balancedNoEscalation, reviewEveryTurnNoEscalation,
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

// 仕様書 11.2 の「良い結末」
export function isGoodOutcome(s: GameState): boolean {
  const o = s.outcome;
  if (!o || o.canceled) return false;
  return (
    o.finalQuality >= 65 && unfinishedRatio(s) <= 0.05 && o.grades.scope !== "bad" && !o.incident && s.departures === 0 &&
    o.releaseTurn - 12 <= 1 && !s.overBudget && s.trust.steering >= 50 && s.trust.ops >= 50
  );
}

// 合意した範囲（上申で減らした分は除く）のうち、できていない割合
export function unfinishedRatio(s: GameState): number {
  return Math.max(0, 1 - Math.min(1, s.doneWork / Math.max(1, s.totalWork)));
}
