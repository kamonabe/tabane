// 外注会社との交渉（仕様書 6.4）
import { CONTRACT_TURNS, HIRE_ONBOARD_AP, HIRE_RAMP_TURNS, HIRE_START, STAFF_FUND_RATE, VENDOR_RATES } from "./balance";
import { clamp, setTrust } from "./derived";
import { createMember, makeSkills, nextMemberId, pickName, pickTrait } from "./members";
import { chance, randomInt } from "./random";
import type { Rng } from "./random";
import type { Archetype, GameState, VendorCandidate } from "./types";

const ORDER_FULL: Archetype[] = ["veteran", "mid", "junior"];
const ORDER_CONDITIONAL: Archetype[] = ["mid", "mid", "junior"];

export function makeCandidates(state: GameState, rng: Rng, conditional: boolean): VendorCandidate[] {
  const used = state.members.map((m) => m.name);
  const out: VendorCandidate[] = [];
  let idCount = state.members.length;
  for (const archetype of conditional ? ORDER_CONDITIONAL : ORDER_FULL) {
    const [lo, hi] = VENDOR_RATES[archetype];
    const name = pickName(rng, used);
    used.push(name);
    idCount += 1;
    out.push({
      member: createMember({
        id: `m${idCount}`, name, employment: "contractor", archetype, skills: makeSkills(rng, archetype),
        morale: HIRE_START.morale, fatigue: HIRE_START.fatigue, trait: pickTrait(rng),
        ratePerTurn: randomInt(rng, lo, hi),
      }),
    });
  }
  return out;
}

export function openVendorModal(s: GameState, rng: Rng, conditional: boolean): void {
  s.pending = { kind: "vendor", conditional, candidates: makeCandidates(s, rng, conditional), negotiated: false };
}

// 単価を下げてもらえないか相談する（1回だけ）
export function negotiateRate(state: GameState, rng: Rng): GameState {
  const s = structuredClone(state);
  const p = s.pending;
  if (!p || p.kind !== "vendor" || p.negotiated) return state;
  p.negotiated = true;
  if (chance(rng, s.trust.vendor / 100 + 0.1)) {
    for (const c of p.candidates) c.member.ratePerTurn = Math.round(c.member.ratePerTurn * 0.9);
    setTrust(s, "vendor", -2);
    s.lastResult = "相談してみたら、「いいですよ、少しお安くしましょう」と言ってもらえた！";
  } else {
    setTrust(s, "vendor", -5);
    s.lastResult = "「うーん、それはちょっと厳しいですね…」。単価はそのまま。相手の印象は少し悪くなったかも。";
  }
  return s;
}

// 候補を採用する。次のターンから参加する
export function hireCandidate(state: GameState, index: number): GameState {
  const s = structuredClone(state);
  const p = s.pending;
  if (!p || p.kind !== "vendor") return state;
  const c = p.candidates[index];
  if (!c) return state;
  const m = c.member;
  m.id = nextMemberId(s.members);
  m.joinedTurn = s.turn + 1;
  m.rampTurns = HIRE_RAMP_TURNS;
  m.morale = clamp(HIRE_START.morale, 0, 100);
  m.leavesAfterTurn = p.conditional ? s.turn + CONTRACT_TURNS : null;
  // 人の費用は、組織長が予算に足してくれる（使ってよい予算にも入る）
  const fund = staffFund(s, m.archetype, p.conditional);
  s.budget += fund;
  s.approvedBudget += fund;
  s.fundedStaff += fund;
  s.nextTurnApPenalty += HIRE_ONBOARD_AP;
  s.members.push(m);
  s.pending = null;
  s.lastResult = `${m.name}さんが、次のターンからチームに加わります。`;
  return s;
}

export function skipVendor(state: GameState): GameState {
  const s = structuredClone(state);
  s.pending = null;
  s.lastResult = "今回は見送りました。";
  return s;
}

// 増員の費用 = 相場の上限 × 払うターン数（承認なら締切まで、条件付きなら最長 3 ターン）
export function staffPayTurns(s: GameState, conditional: boolean): number {
  const rest = Math.max(0, s.deadline - s.turn);
  return conditional ? Math.min(CONTRACT_TURNS, rest) : rest;
}

export function staffFund(s: GameState, archetype: Archetype, conditional: boolean): number {
  return STAFF_FUND_RATE[archetype] * staffPayTurns(s, conditional);
}
