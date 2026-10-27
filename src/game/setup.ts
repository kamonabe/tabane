// 初期生成（仕様書 3章）。乱数は createRng(seed) 1本を決まった順に使う。
import {
  AP_BASE, AP_MEETING_COST, CAPACITY_FACTOR, DIFFICULTY_CAP, INITIAL_DEADLINE, PROJECT_TITLES, RATIO_MIN,
  RATIO_SPREAD, SETUP_MAX_TRIES, SLACK_MIN_FOR_HIGH_RATIO, SLACK_RANGE,
} from "./balance";
import { createMember, makeSkills, nextMemberId, pickName, pickTrait } from "./members";
import { isMeetingTurn } from "./phases";
import { createRng, pick, randomInt } from "./random";
import type { Rng } from "./random";
import type { Archetype, GameState, Level3, Member, Size } from "./types";

const SIZES: Size[] = ["small", "medium", "large"];
const SIZE_PREFIX: Record<Size, string> = { small: "ちょっとした", medium: "", large: "大がかりな" };
const TEAM_RANGE: Record<Size, [number, number]> = { small: [3, 4], medium: [4, 5], large: [5, 6] };
const CONTRACTOR_RANGE: Record<Size, [number, number]> = { small: [0, 1], medium: [0, 1], large: [1, 2] };

// 名目上の作業能力（隠れた手戻り・休み・育成を含まない）
export function nominalCapacity(members: readonly Member[]): number {
  let sum = 0;
  for (const m of members) {
    const { design, build, test } = m.skills;
    sum += 2 * (1 + design) + 3 * (1 + build) + 3 * (1 + (build + test) / 2);
  }
  return sum * CAPACITY_FACTOR;
}

export function difficultyOf(s: Pick<GameState, "members" | "totalWork" | "profile">): number {
  const ratio = s.totalWork / nominalCapacity(s.members);
  const p = s.profile;
  return ratio + (p.uncertainty - 45) / 200 + (p.novelty - 2) * 0.04 + (p.deadlineFirm ? 0.03 : 0);
}

export interface SetupCheck {
  hasBuilder: boolean;
  hasCoordinator: boolean;
  slackOk: boolean;
  difficultyOk: boolean;
}

export function checkSetup(s: GameState): SetupCheck {
  const rate = s.members.reduce((a, m) => a + m.ratePerTurn, 0);
  return {
    hasBuilder: s.members.some((m) => m.skills.build >= 3),
    hasCoordinator: s.members.some((m) => m.skills.coord >= 3),
    slackOk: s.initialBudget - rate * INITIAL_DEADLINE >= SLACK_RANGE[0],
    difficultyOk: difficultyOf(s) <= DIFFICULTY_CAP + 0.01,
  };
}

export function validateSetup(s: GameState): boolean {
  const c = checkSetup(s);
  return c.hasBuilder && c.hasCoordinator && c.slackOk && c.difficultyOk;
}

function generate(rng: Rng, seed: number, force: boolean): GameState {
  const size = pick(rng, SIZES);
  const count = randomInt(rng, ...TEAM_RANGE[size]);
  const outsourced = randomInt(rng, ...CONTRACTOR_RANGE[size]);
  const members: Member[] = [];
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const archetype: Archetype = i === 0 ? "veteran" : pick<Archetype>(rng, ["mid", "mid", "junior", "veteran"]);
    const skills = makeSkills(rng, archetype);
    const morale = randomInt(rng, 50, 75);
    const fatigue = randomInt(rng, 5, 25);
    const trait = pickTrait(rng);
    const name = pickName(rng, names);
    names.push(name);
    const contractor = i >= count - outsourced;
    members.push(
      createMember({
        id: nextMemberId(members), name, employment: contractor ? "contractor" : "staff", archetype, skills,
        morale, fatigue, trait, ratePerTurn: contractor ? randomInt(rng, 70, 120) : 0,
      }),
    );
  }
  const uncertainty = randomInt(rng, 20, 70);
  const opsImpact = randomInt(rng, 1, 3) as Level3;
  const novelty = randomInt(rng, 1, 3) as Level3;
  const durationMonths = pick<3 | 6 | 9 | 12>(rng, [3, 6, 9, 12]);
  const deadlineFirm = rng() < 0.4;
  const estimateBias = -(uncertainty / 100) * (0.2 + 0.2 * rng());

  // 最後の試行では、保証を満たすように補正する
  if (force && !members.some((m) => m.skills.coord >= 3)) members[0].skills.coord = 3;
  if (force && !members.some((m) => m.skills.build >= 3)) members[0].skills.build = 3;

  const nominal = nominalCapacity(members);
  let ratio = RATIO_MIN + RATIO_SPREAD * rng();
  let difficulty = ratio + (uncertainty - 45) / 200 + (novelty - 2) * 0.04 + (deadlineFirm ? 0.03 : 0);
  if (difficulty > DIFFICULTY_CAP) {
    ratio -= difficulty - DIFFICULTY_CAP;
    difficulty = DIFFICULTY_CAP;
  }
  const totalWork = Math.round(nominal * ratio);
  let slack = randomInt(rng, SLACK_RANGE[0], SLACK_RANGE[1]);
  if (ratio > 1.35) slack = Math.max(slack, SLACK_MIN_FOR_HIGH_RATIO);
  const budget = members.reduce((a, m) => a + m.ratePerTurn * INITIAL_DEADLINE, 0) + slack;
  const clarity = 100 - uncertainty;

  const base = pick(rng, PROJECT_TITLES);
  const state: GameState = {
    seed,
    turn: 1,
    deadline: INITIAL_DEADLINE,
    committedDeadline: INITIAL_DEADLINE,
    profile: {
      title: SIZE_PREFIX[size] + base,
      size, uncertainty, opsImpact, novelty, durationMonths,
      weeksPerTurn: (durationMonths / 3) as 1 | 2 | 3 | 4,
      deadlineFirm,
      difficultyLabel: difficulty < 1.25 ? "easy" : difficulty < 1.4 ? "normal" : "hard",
    },
    members,
    totalWork, originalTotalWork: totalWork, doneWork: 0, hiddenGap: 0, estimateBias,
    clarity, initialClarity: clarity, quality: 55, techDebt: novelty === 3 ? 10 : 0,
    budget, initialBudget: budget, budgetAdded: 0, spent: 0, overBudget: false,
    trust: { steering: randomInt(rng, 45, 60), ops: randomInt(rng, 40, 60), vendor: 50 },
    turnsSinceOpsSync: 0, turnsSinceVendorTalk: 0,
    apMax: AP_BASE, apUsed: 0, apPenalty: 0, nextTurnApPenalty: 0, plan: [], escalatedThisTurn: false,
    lastTurnNemawashi: false, lastReviewTurn: -99, glossDebt: 0, honestyCredit: 0, riskShared: false,
    reestimatePromised: false, secretNewsTurn: null, escalationCount: 0, escalations: [],
    scopeCutTotal: 0, deferredScope: 0, departures: 0, skillUps: 0, onceFlags: {}, eventCounts: {},
    lastEventId: null,
    status: "playing", pending: null, lastResult: null, outcome: null, log: [], history: [], seenTerms: [],
  };
  state.apMax = AP_BASE - (isMeetingTurn(1) ? AP_MEETING_COST : 0);
  return state;
}

export function createInitialState(seed: number): GameState {
  const rng = createRng(seed);
  let state = generate(rng, seed, false);
  for (let i = 1; i < SETUP_MAX_TRIES && !validateSetup(state); i++) {
    state = generate(rng, seed, i === SETUP_MAX_TRIES - 1);
  }
  return state;
}
