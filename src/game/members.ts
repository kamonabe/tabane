import {
  BASE_SKILL, COACH_FACTOR, DEBT_FACTOR_DIV, DEBT_FACTOR_MIN, FATIGUE_FACTORS, FATIGUE_HIGH, FATIGUE_MID,
  MEMBER_NAMES, MODE_FACTOR, MODE_FATIGUE, MODE_MORALE, MORALE_HOME, RAMP_FACTOR,
} from "./balance";
import { clamp } from "./derived";
import { phaseSkill } from "./phases";
import { pick, randomInt } from "./random";
import type { Rng } from "./random";
import type { Archetype, Employment, Member, Mode, Phase, SkillKey, Skills, Trait } from "./types";

const SKILL_KEYS: SkillKey[] = ["design", "build", "test", "domain", "coord"];
const TRAITS: Trait[] = ["careful", "normal", "optimistic"];

export function makeSkills(rng: Rng, archetype: Archetype): Skills {
  const base = BASE_SKILL[archetype];
  const skills = {} as Skills;
  for (const k of SKILL_KEYS) skills[k] = clamp(base + randomInt(rng, -1, 1), 1, 5);
  return skills;
}

export function pickTrait(rng: Rng): Trait {
  return pick(rng, TRAITS);
}

// 使われていない名前から選ぶ（なくなったら全体から）
export function pickName(rng: Rng, used: readonly string[]): string {
  const free = MEMBER_NAMES.filter((n) => !used.includes(n));
  return pick(rng, free.length > 0 ? free : MEMBER_NAMES);
}

export function portraitFor(name: string): string {
  const i = (MEMBER_NAMES as readonly string[]).indexOf(name);
  return `member-${i + 1}`;
}

export interface CreateMemberOptions {
  id: string;
  name: string;
  employment: Employment;
  archetype: Archetype;
  skills: Skills;
  morale: number;
  fatigue: number;
  trait: Trait;
  ratePerTurn?: number;
  joinedTurn?: number;
}

export function createMember(o: CreateMemberOptions): Member {
  return {
    id: o.id,
    name: o.name,
    portraitId: o.employment === "helper" ? "helper" : portraitFor(o.name),
    employment: o.employment,
    archetype: o.archetype,
    skills: o.skills,
    morale: o.morale,
    fatigue: o.fatigue,
    trait: o.trait,
    traitRevealed: false,
    mode: "normal",
    awayTurns: 0,
    rampTurns: 0,
    coachedCount: 0,
    lastCoachedSkill: null,
    ratePerTurn: o.ratePerTurn ?? 0,
    leavesAfterTurn: null,
    left: false,
    joinedTurn: o.joinedTurn ?? 1,
  };
}

export function nextMemberId(members: readonly Member[]): string {
  return `m${members.length + 1}`;
}

export function fatigueFactor(fatigue: number): number {
  return fatigue < FATIGUE_MID ? FATIGUE_FACTORS.low : fatigue < FATIGUE_HIGH ? FATIGUE_FACTORS.mid : FATIGUE_FACTORS.high;
}

export function debtFactor(techDebt: number): number {
  return Math.max(DEBT_FACTOR_MIN, 1 - techDebt / DEBT_FACTOR_DIV);
}

// メンバ1人のこのターンの出力（仕様書 5.1-3）
export function memberOutput(m: Member, phase: Phase, techDebt: number, coached: boolean): number {
  const skill = phaseSkill(phase, m);
  return (
    (1 + skill) * MODE_FACTOR[m.mode] * (0.7 + m.morale / 200) * fatigueFactor(m.fatigue) * debtFactor(techDebt) *
    (m.rampTurns > 0 ? RAMP_FACTOR : 1) * (coached ? COACH_FACTOR : 1)
  );
}

// 働き方による士気・疲労の増減（4.2）。m を直接書き換える
export function applyModeEffects(m: Member): void {
  m.fatigue = clamp(m.fatigue + MODE_FATIGUE[m.mode], 0, 100);
  if (m.mode === "normal" || m.mode === "support") {
    if (m.morale < MORALE_HOME) m.morale = Math.min(MORALE_HOME, m.morale + 1);
    else if (m.morale > MORALE_HOME) m.morale = Math.max(MORALE_HOME, m.morale - 1);
  } else {
    m.morale += MODE_MORALE[m.mode];
  }
  m.morale = clamp(m.morale, 0, 100);
}

export function changeMorale(m: Member, delta: number): void {
  m.morale = clamp(m.morale + delta, 0, 100);
}

export function changeFatigue(m: Member, delta: number): void {
  m.fatigue = clamp(m.fatigue + delta, 0, 100);
}

export const MODES: Mode[] = ["normal", "push", "rest", "support"];
