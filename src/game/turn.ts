// 1ターンの処理（仕様書 5.1）。処理順は仕様書どおりに固定している。
import {
  CLARITY_PER_OUTPUT, GAP_LOG_THRESHOLD, HANDS_ON_OUTPUT, HIGH_FATIGUE_MORALE, FATIGUE_HIGH, NEGLECT_OPS_CLARITY,
  NEGLECT_OPS_TRUST, NEGLECT_OPS_TURNS, NEGLECT_VENDOR_TRUST, NEGLECT_VENDOR_TURNS, NO_TEAM_ACTION_MORALE,
  NO_TEAM_ACTION_WASTE_MULT, OPS_SYNC_CLARITY_EARLY, OPS_SYNC_CLARITY_LATE, OPS_SYNC_TRUST, NEMAWASHI_TRUST,
  OVER_BUDGET_TRUST, OVERFLOW_TO_QUALITY, OVERFLOW_TO_WORK, PUSH_DEBT, PUSH_QUALITY, PUSH_WASTE_MULT,
  REVIEW_DEBT, REVIEW_QUALITY, REVIEW_REVEAL_FRAC, REVIEW_REVEAL_MAX, REVIEW_WASTE_MULT, SECRET_NEWS_MORALE, TEST_AUTO_REVEAL,
  VENDOR_TALK_TRUST, WASTE_BIAS, COACH_MORALE, ONE_ON_ONE_FATIGUE, ONE_ON_ONE_MORALE,
} from "./balance";
import { computeApMax } from "./actions";
import {
  activeMembers, actualFrac, addLog, addLogFirstImportant, avg, clamp, contractors, presentMembers, reportedFrac,
  setTrust,
} from "./derived";
import { applyModeEffects, changeFatigue, changeMorale, memberOutput } from "./members";
import { isWorkPhase, phaseOf, plannedFrac } from "./phases";
import type { GameState, LeaderAction } from "./types";

function count(plan: readonly LeaderAction[], kind: LeaderAction["kind"]): number {
  return plan.filter((a) => a.kind === kind).length;
}

// leavesAfterTurn に達したメンバを抜けた扱いにする
export function processLeaves(s: GameState): void {
  for (const m of s.members) {
    if (!m.left && m.leavesAfterTurn !== null && m.leavesAfterTurn <= s.turn) {
      m.left = true;
      addLog(s, "memberLeft", `${m.name}さんがチームを離れました`, false);
    }
  }
}

// 仕事の成果を doneWork に入れる。あふれた分は品質へ。waste は申告だけ増える分
function applyWork(s: GameState, gain: number, waste: number): void {
  const room = Math.max(0, s.totalWork - s.doneWork);
  if (room <= 0) {
    s.quality += gain * OVERFLOW_TO_QUALITY;
    return;
  }
  const add = Math.min(gain, room);
  s.doneWork += add;
  s.quality += (gain - add) * OVERFLOW_TO_QUALITY;
  s.hiddenGap += waste;
}

// ターンの終わりの処理（5.1 の 1〜14）。次の画面（会議・イベント・リリース）への遷移は flow.ts
export function resolveTurn(state: GameState): GameState {
  const s = structuredClone(state);
  const plan = s.plan;
  const phase = phaseOf(s.turn, s.deadline);
  const hasReview = count(plan, "review") > 0;

  // 1. チーム側の行動があったか
  const teamActed = plan.some((a) => a.kind === "review" || a.kind === "oneOnOne" || a.kind === "coach");

  // 2. 育成（出力計算より前）
  const coached = new Set<string>();
  for (const a of plan) {
    if (a.kind !== "coach") continue;
    const m = s.members.find((x) => x.id === a.memberId);
    if (!m || m.left || m.skills[a.skill] >= 5) continue;
    m.skills[a.skill] += 1;
    m.coachedCount += 1;
    m.lastCoachedSkill = a.skill;
    changeMorale(m, COACH_MORALE);
    coached.add(m.id);
    s.skillUps += 1;
  }

  // 3. メンバ出力
  const active = activeMembers(s);
  const activeIds = new Set(active.map((m) => m.id));
  const workers = active.filter((m) => m.mode !== "support");
  const outputs = workers.map((m) => ({ m, out: memberOutput(m, phase, s.techDebt, coached.has(m.id)) }));
  const leaderOut = HANDS_ON_OUTPUT * count(plan, "handsOn");

  // 4. 出力を適用
  if (!isWorkPhase(phase)) {
    const total = outputs.reduce((a, o) => a + o.out, 0) + leaderOut;
    const next = s.clarity + total * CLARITY_PER_OUTPUT;
    if (next > 100) {
      const overflow = (next - 100) / CLARITY_PER_OUTPUT;
      s.clarity = 100;
      applyWork(s, Math.min(s.totalWork - s.doneWork, overflow * OVERFLOW_TO_WORK), 0);
    } else {
      s.clarity = next;
    }
  } else {
    for (const { m, out } of outputs) {
      const bias = m.employment === "helper" ? WASTE_BIAS.careful : WASTE_BIAS[m.trait];
      const waste =
        out * bias * (m.mode === "push" ? PUSH_WASTE_MULT : 1) * (teamActed ? 1 : NO_TEAM_ACTION_WASTE_MULT) *
        (hasReview ? REVIEW_WASTE_MULT : 1);
      applyWork(s, out - waste, waste);
    }
    if (leaderOut > 0) applyWork(s, leaderOut, 0);
  }

  // 5. レビューの公開（申告ずれが生まれたあと）
  if (hasReview) {
    s.lastReviewTurn = s.turn;
    const found = s.hiddenGap; // レビューで見つかったずれ。見えるのは一部だけで、残りは次のレビューやテストまで残る
    s.hiddenGap -= Math.min(found * REVIEW_REVEAL_FRAC, REVIEW_REVEAL_MAX);
    if (found >= GAP_LOG_THRESHOLD) {
      addLogFirstImportant(s, "gapRevealed", "レビューで、申告より実際の進みが遅れていたことが分かった");
    }
  }

  // 6. テスト・リリースでは、実態がだんだんばれる
  if (phase === "test" || phase === "release") s.hiddenGap -= s.hiddenGap * TEST_AUTO_REVEAL;

  // 7. 品質と負債
  if (isWorkPhase(phase)) {
    const pushCount = workers.filter((m) => m.mode === "push").length;
    s.techDebt += s.profile.novelty + PUSH_DEBT * pushCount + (hasReview ? -REVIEW_DEBT : 2);
    s.quality += REVIEW_QUALITY * (hasReview ? 1 : 0) - PUSH_QUALITY * pushCount;
  }
  s.techDebt = clamp(s.techDebt, 0, 100);
  s.quality = clamp(s.quality, 0, 100);

  // 8. 士気・疲労
  for (const m of presentMembers(s)) {
    if (m.awayTurns > 0 && !activeIds.has(m.id)) {
      changeFatigue(m, -15);
      m.awayTurns -= 1;
      continue;
    }
    if (!activeIds.has(m.id)) continue;
    applyModeEffects(m);
  }
  for (const a of plan) {
    if (a.kind !== "oneOnOne") continue;
    const m = s.members.find((x) => x.id === a.memberId);
    if (!m || m.left) continue;
    changeMorale(m, ONE_ON_ONE_MORALE);
    changeFatigue(m, -ONE_ON_ONE_FATIGUE);
    m.traitRevealed = true;
  }
  for (const m of active) {
    if (!teamActed) changeMorale(m, NO_TEAM_ACTION_MORALE);
    if (m.fatigue >= FATIGUE_HIGH) changeMorale(m, HIGH_FATIGUE_MORALE);
    if (m.rampTurns > 0) m.rampTurns -= 1;
  }

  // 運用・組織長・外注の信頼につながる行動の効果
  if (count(plan, "opsSync") > 0) {
    setTrust(s, "ops", OPS_SYNC_TRUST);
    s.clarity = clamp(s.clarity + (s.turn <= 4 ? OPS_SYNC_CLARITY_EARLY : OPS_SYNC_CLARITY_LATE), 0, 100);
  }
  if (count(plan, "nemawashi") > 0) setTrust(s, "steering", NEMAWASHI_TRUST);
  if (count(plan, "vendorTalk") > 0) setTrust(s, "vendor", VENDOR_TALK_TRUST);

  // 9. 調整の放置
  s.turnsSinceOpsSync = count(plan, "opsSync") > 0 ? 0 : s.turnsSinceOpsSync + 1;
  if (s.turnsSinceOpsSync >= NEGLECT_OPS_TURNS && s.turn >= 3) {
    setTrust(s, "ops", NEGLECT_OPS_TRUST);
    if (s.turn >= 5) s.clarity = clamp(s.clarity + NEGLECT_OPS_CLARITY, 0, 100);
    addLogFirstImportant(s, "neglectOps", "運用担当さんと、しばらく話せていない");
  }
  s.turnsSinceVendorTalk = count(plan, "vendorTalk") > 0 ? 0 : s.turnsSinceVendorTalk + 1;
  if (contractors(s).length > 0 && s.turnsSinceVendorTalk >= NEGLECT_VENDOR_TURNS) {
    setTrust(s, "vendor", NEGLECT_VENDOR_TRUST);
  }

  // 10. お金
  const cost = contractors(s)
    .filter((m) => m.joinedTurn <= s.turn)
    .reduce((a, m) => a + m.ratePerTurn, 0);
  s.budget -= cost;
  s.spent += cost;
  if (s.budget < 0) {
    s.budget = 0;
    for (const m of contractors(s)) m.left = true;
    setTrust(s, "steering", OVER_BUDGET_TRUST);
    s.overBudget = true;
    addLog(s, "overBudget", "予算が尽きて、外注のみなさんの契約が止まった");
  }

  // 11. 契約終了・助っ人の期限
  processLeaves(s);

  // 12. 黙っていた予算削減が発覚
  if (s.secretNewsTurn === s.turn) {
    for (const m of presentMembers(s)) changeMorale(m, SECRET_NEWS_MORALE);
    s.secretNewsTurn = null;
    addLog(s, "secretNews", "予算が減っていたことを、チームが別ルートで知ってしまった");
  }

  // 13. 根回しフラグ
  s.lastTurnNemawashi = count(plan, "nemawashi") > 0;

  // 14. 記録
  const present = presentMembers(s);
  s.history.push({
    turn: s.turn,
    reportedFrac: reportedFrac(s),
    actualFrac: actualFrac(s),
    plannedFrac: plannedFrac(s.turn, s.deadline),
    quality: s.quality,
    techDebt: s.techDebt,
    trust: { ...s.trust },
    avgMorale: avg(present.map((m) => m.morale)),
    avgFatigue: avg(present.map((m) => m.fatigue)),
    budget: s.budget,
  });
  s.plan = [];
  s.apUsed = 0;
  return s;
}

// 次のターンへ
export function nextTurn(state: GameState): GameState {
  const s = structuredClone(state);
  processLeaves(s);
  s.turn += 1;
  s.apPenalty = s.nextTurnApPenalty;
  s.nextTurnApPenalty = 0;
  s.apMax = computeApMax(s);
  s.apUsed = 0;
  s.plan = [];
  s.escalatedThisTurn = false;
  s.status = "playing";
  s.pending = null;
  return s;
}
