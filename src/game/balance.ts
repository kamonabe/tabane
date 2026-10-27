// 数値の調整はここだけで行う（仕様書 各章の数字）。
import type { Archetype, Mode, Trait } from "./types";

export const INITIAL_DEADLINE = 12;
export const MAX_DEADLINE = 14;
export const MEETING_TURNS = [2, 6, 9] as const;
export const MAX_TEAM_SIZE = 7;

// AP
export const AP_BASE = 4;
export const AP_MEETING_COST = 1;
export const AP_SUPPORT_BONUS_MAX = 2;
export const SUPPORT_MIN_COORD = 3;

// メンバの働き方（4.2）
export const MODE_FACTOR: Record<Mode, number> = { normal: 1.0, push: 1.4, rest: 0.4, support: 0 };
export const MODE_FATIGUE: Record<Mode, number> = { normal: 4, push: 16, rest: -20, support: 3 };
export const MODE_MORALE: Record<Mode, number> = { normal: 0, push: -4, rest: 3, support: 0 };
export const MORALE_HOME = 60;
export const PUSH_DEBT = 2;
export const PUSH_QUALITY = 1;
export const PUSH_WASTE_MULT = 1.5;

// 出力
export const FATIGUE_MID = 50;
export const FATIGUE_HIGH = 80;
export const FATIGUE_FACTORS = { low: 1, mid: 0.85, high: 0.65 };
export const DEBT_FACTOR_MIN = 0.6;
export const DEBT_FACTOR_DIV = 250;
export const RAMP_FACTOR = 0.5;
export const COACH_FACTOR = 0.5;
export const HANDS_ON_OUTPUT = 2;
export const CLARITY_PER_OUTPUT = 0.3;
export const OVERFLOW_TO_WORK = 0.5;
export const OVERFLOW_TO_QUALITY = 0.25;

// 申告のずれ
export const WASTE_BIAS: Record<Trait, number> = { careful: 0.05, normal: 0.12, optimistic: 0.22 };
export const NO_TEAM_ACTION_WASTE_MULT = 1.25;
export const REVIEW_WASTE_MULT = 0.5;
export const REVIEW_REVEAL_MAX = 15;
export const TEST_AUTO_REVEAL = 0.4;
export const GAP_LOG_THRESHOLD = 5;

// 行動
export const HANDS_ON_MAX = 2;
export const REVIEW_QUALITY = 3;
export const REVIEW_DEBT = 4;
export const ONE_ON_ONE_MORALE = 15;
export const ONE_ON_ONE_FATIGUE = 5;
export const COACH_MORALE = 3;
export const COACH_LIMIT: Record<Archetype, number> = { veteran: 2, mid: 2, junior: 3 };
export const OPS_SYNC_TRUST = 5;
export const OPS_SYNC_CLARITY_EARLY = 12;
export const OPS_SYNC_CLARITY_LATE = 8;
export const NEMAWASHI_TRUST = 4;
export const VENDOR_TALK_TRUST = 5;
export const NO_TEAM_ACTION_MORALE = -3;
export const HIGH_FATIGUE_MORALE = -3;

// 放置
export const NEGLECT_OPS_TURNS = 3;
export const NEGLECT_OPS_TRUST = -4;
export const NEGLECT_OPS_CLARITY = -2;
export const NEGLECT_VENDOR_TURNS = 4;
export const NEGLECT_VENDOR_TRUST = -3;
export const OVER_BUDGET_TRUST = -10;
export const SECRET_NEWS_MORALE = -8;

// 上申（6章）
export const ESC_COST = { quick: 1, prepared: 2 } as const;
export const ESC_PREPARED_BONUS = 15;
export const ESC_NEMAWASHI_BONUS = 15;
export const ESC_COUNT_PENALTY = 10;
export const ESC_GLOSS_PENALTY = 15;
export const ESC_RECOVERY_BONUS = 15;
export const ESC_REESTIMATE_BONUS = 20;
export const ESC_FIRM_PENALTY = 25;
export const ESC_APPROVE = 70;
export const ESC_CONDITIONAL = 50;
export const ESC_ROLL_SPREAD = 10;
export const ESC_REJECT_TRUST = -2;
export const ADD_BUDGET = { approved: 250, conditional: 120 };
export const CUT_SCOPE = { approved: 0.15, conditional: 0.08 };
export const EXTEND = { approved: 2, conditional: 1 };
export const CUT_SCOPE_OPS = -6;
export const CUT_SCOPE_OPS_WITH_SYNC = -2;
export const CONTRACT_TURNS = 3;
export const GUIDE_GOOD = 75;
export const GUIDE_FAIR = 55;

// ベンダ（6.4）
export const VENDOR_RATES = { veteran: [120, 140], mid: [90, 110], junior: [65, 80] } as const;
export const HIRE_START = { morale: 60, fatigue: 10 };
export const HELPER_TURNS = 2;

// ステコミ（7.1）
export const BEHIND_ONTRACK = 0.05;
export const BEHIND_GLOSS_REVEAL = 0.1;
export const GLOSS_PENALTY = 12;
export const CANCEL_STEERING = 10;

// イベント（7.4）
export const EVENT_CHANCE = 0.6;
export const EVENT_CHANCE_MEETING = 0.3;

// リリース（8章）
export const AUTO_RELEASE_RATIO = 0.02;
export const GLOSS_REVEAL_RELEASE_RATIO = 0.05;
export const HONESTY_BONUS = 3;
export const DEFER_OPS_BASE = 8;
export const DEFER_OPS_PER_RATIO = 40;
export const INCOMPLETE_QUALITY_PENALTY = 60;
export const DEBT_QUALITY_PENALTY = 0.3;
export const INCIDENT_BASE = 70;
export const INCIDENT_OPS_MULT = { 1: 0.7, 2: 1.0, 3: 1.3 } as const;
export const INCIDENT_MIN = 0.03;
export const INCIDENT_MAX = 0.8;
export const INCIDENT_OPS = -20;
export const INCIDENT_STEERING = -10;

// 評価のしきい値 [great, good, meh]
export const GRADE_QUALITY = [80, 65, 45] as const;
export const GRADE_COST = [0.9, 1.0, 1.2] as const; // 以下
export const GRADE_DELIVERY = [0, 1, 2] as const; // 以下
export const GRADE_SCOPE = [0.95, 0.85, 0.7] as const;
export const GRADE_STAKEHOLDERS = [70, 55, 40] as const;
export const GRADE_TEAM = [65, 50, 35] as const;

// 初期生成（3章）
export const SETUP_MAX_TRIES = 20;
export const RATIO_MIN = 1.05;
export const RATIO_SPREAD = 0.3;
export const DIFFICULTY_CAP = 1.5;
export const CAPACITY_FACTOR = 0.9;
export const SLACK_RANGE = [150, 400] as const;
export const SLACK_MIN_FOR_HIGH_RATIO = 250;
export const BASE_SKILL: Record<Archetype, number> = { veteran: 4, mid: 3, junior: 2 };
export const MEMBER_NAMES = [
  "ハルカ", "ソウタ", "ミオ", "レン", "ユイ", "カイト", "ナナ",
  "リク", "サキ", "タイガ", "モモ", "ジン", "アオイ", "ケンタ",
] as const;
export const PROJECT_TITLES = [
  "社内の申請をラクにするしくみ",
  "お問い合わせ受付のしくみ",
  "在庫をかぞえるしくみ",
  "会議室よやくのしくみ",
  "勤怠をつけるしくみ",
  "お知らせ配信のしくみ",
] as const;
