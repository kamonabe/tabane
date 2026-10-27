// ゲーム全体で使う型（仕様書 2章）。DOM には触れない。
export type Phase = "concept" | "requirements" | "design" | "build" | "test" | "release";
export type SkillKey = "design" | "build" | "test" | "domain" | "coord";
export type Skills = Record<SkillKey, number>; // 各 1..5 の整数
export type CoachSkill = Exclude<SkillKey, "coord">;
export type Mode = "normal" | "push" | "rest" | "support";
export type Trait = "careful" | "normal" | "optimistic"; // きっちり／ふつう／楽観的（申告の盛りぐせ）
export type Archetype = "veteran" | "mid" | "junior";
export type Employment = "staff" | "contractor" | "helper"; // 社員／外注要員／助っ人
export type Size = "small" | "medium" | "large";
export type Level3 = 1 | 2 | 3; // 低・中・高
export type Grade = "great" | "good" | "meh" | "bad"; // ◎ ○ △ ×
export type Expression = "normal" | "happy" | "troubled";

export type EscalationType = "addStaff" | "addBudget" | "cutScope" | "extendSchedule";
export type EscalationStyle = "quick" | "prepared";
// 上申を開いた場所。ステコミ・イベント・リリース判定から開いたものは AP を使わない
export type EscalationSource = "turn" | "kickoff" | "recovery" | "reestimate" | "bigBug" | "release";

export type EventId =
  | "opsRequest" | "reqRework" | "reqDropped" | "memberSick" | "quitRisk" | "memberGrowth"
  | "veteranHelp" | "vendorRateUp" | "memberSwap" | "budgetCut" | "bossPullIn" | "bigBug";

export type EndingId =
  | "canceled" | "incident" | "bundled" | "burnout" | "quiet" | "thanked" | "smallStart" | "grew" | "managed";

export interface Member {
  id: string; // "m1" など
  name: string; // カタカナの下の名前
  portraitId: string; // 絵の差し替えキー
  employment: Employment;
  archetype: Archetype;
  skills: Skills;
  morale: number; // 0..100 士気
  fatigue: number; // 0..100 疲労
  trait: Trait;
  traitRevealed: boolean; // 1on1 で判明
  mode: Mode;
  awayTurns: number; // >0 の間は休み（出力なし）
  rampTurns: number; // >0 の間は出力×0.5（立ち上がり）
  coachedCount: number; // 育成を受けた回数
  lastCoachedSkill: CoachSkill | null; // 成長イベントで使う
  ratePerTurn: number; // 外注のみ。社員・助っ人は0
  leavesAfterTurn: number | null; // このターンの終わりに抜ける（契約終了・助っ人の期限）
  left: boolean; // 抜けた
  joinedTurn: number;
}

export interface ProjectProfile {
  title: string;
  size: Size;
  uncertainty: number; // 20..70 要件の不確かさ
  opsImpact: Level3;
  novelty: Level3;
  durationMonths: 3 | 6 | 9 | 12;
  weeksPerTurn: 1 | 2 | 3 | 4;
  deadlineFirm: boolean;
  difficultyLabel: "easy" | "normal" | "hard";
}

export interface Trust {
  steering: number;
  ops: number;
  vendor: number;
} // 0..100

export type LeaderAction =
  | { kind: "handsOn" }
  | { kind: "review" }
  | { kind: "oneOnOne"; memberId: string }
  | { kind: "coach"; memberId: string; skill: CoachSkill }
  | { kind: "opsSync" }
  | { kind: "nemawashi" }
  | { kind: "vendorTalk" };

export interface EscalationRecord {
  turn: number;
  type: EscalationType;
  style: EscalationStyle;
  score: number;
  roll: number;
  outcome: "approved" | "conditional" | "rejected";
}

export interface VendorCandidate {
  member: Member; // 採用すると、そのままチームに入る
}

export type PendingModal =
  | { kind: "meeting"; meeting: "kickoff" | "progress" }
  | { kind: "event"; eventId: EventId; targetId: string | null }
  | { kind: "escalation"; source: EscalationSource; types: EscalationType[] }
  | { kind: "vendor"; conditional: boolean; candidates: VendorCandidate[]; negotiated: boolean }
  | { kind: "release"; extensionTried: boolean };

export interface Outcome {
  canceled: boolean;
  releaseTurn: number;
  incident: boolean;
  finalQuality: number;
  incompleteRatio: number;
  grades: Record<"quality" | "cost" | "delivery" | "scope" | "stakeholders" | "team", Grade>;
  endingId: EndingId;
}

export interface TurnSnapshot {
  turn: number;
  reportedFrac: number;
  actualFrac: number;
  plannedFrac: number;
  quality: number;
  techDebt: number;
  trust: Trust;
  avgMorale: number;
  avgFatigue: number;
  budget: number;
}

export interface LogEntry {
  turn: number;
  kind: string; // 振り返りメモのキー
  text: string; // 何が起きたか（短文）
  important: boolean; // 振り返りの年表に載せるか
}

export interface GameState {
  seed: number;
  turn: number; // 1 始まり
  deadline: number; // 初期12、11..14
  committedDeadline: number; // 納期評価の基準
  profile: ProjectProfile;
  members: Member[];
  // 作業
  totalWork: number;
  originalTotalWork: number;
  doneWork: number;
  hiddenGap: number; // 申告 = doneWork + hiddenGap
  estimateBias: number;
  clarity: number;
  initialClarity: number;
  quality: number;
  techDebt: number;
  // お金
  budget: number;
  initialBudget: number;
  budgetAdded: number;
  approvedBudget: number; // 使ってよい予算。はじめは initialBudget。増員の費用で増え、予算の見直しで減る
  fundedStaff: number; // 増員で足された費用の合計
  budgetCutAmount: number; // 予算の見直しで減った額
  unplannedCost: number; // 延長したターンの外注費（予定外の出費）
  replanned: boolean; // リリース判定より前の延長で、計画を変えた
  spent: number;
  overBudget: boolean;
  overBudgetTurn: number | null;
  // 関係者
  trust: Trust;
  turnsSinceOpsSync: number;
  turnsSinceVendorTalk: number;
  // AP
  apMax: number;
  apUsed: number;
  apPenalty: number; // このターンの AP 減少（前ターンのイベントなどによる）
  nextTurnApPenalty: number;
  plan: LeaderAction[];
  escalatedThisTurn: boolean;
  // フラグ
  lastTurnNemawashi: boolean;
  lastReviewTurn: number; // 未実施なら -99
  glossDebt: number;
  honestyCredit: number;
  riskShared: boolean;
  reestimatePromised: boolean;
  secretNewsTurn: number | null;
  escalationCount: number;
  escalations: EscalationRecord[];
  scopeCutTotal: number;
  deferredScope: number;
  departures: number;
  skillUps: number;
  onceFlags: Record<string, boolean>;
  eventCounts: Record<string, number>;
  lastEventId: string | null;
  // 進行
  status: "playing" | "meeting" | "event" | "release" | "finished";
  pending: PendingModal | null;
  lastResult: string | null; // 直前の選択の結果文（UI が結果カードに出す）
  outcome: Outcome | null;
  log: LogEntry[];
  history: TurnSnapshot[];
  seenTerms: string[];
}
