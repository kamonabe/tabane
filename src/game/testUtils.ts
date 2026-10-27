// テスト用の小道具
import { createInitialState } from "./setup";
import { createMember, makeSkills } from "./members";
import { createRng } from "./random";
import type { Rng } from "./random";
import type { GameState, Member, Trait } from "./types";

// 決まった値を順に返す乱数（尽きたら最後の値）
export function fixedRng(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

export function member(id: string, o: Partial<Member> & { trait?: Trait } = {}): Member {
  const m = createMember({
    id, name: o.name ?? `ハルカ${id}`, employment: "staff", archetype: "mid",
    skills: { design: 3, build: 3, test: 3, domain: 3, coord: 3 }, morale: 60, fatigue: 10, trait: o.trait ?? "normal",
  });
  return { ...m, ...o };
}

// 名前や乱数に左右されない、素直な状態
export function baseState(over: Partial<GameState> = {}): GameState {
  const s = createInitialState(1);
  s.members = [member("m1"), member("m2")];
  s.profile = { ...s.profile, novelty: 2, opsImpact: 2, uncertainty: 40, deadlineFirm: false };
  s.totalWork = s.originalTotalWork = 100;
  s.doneWork = 0;
  s.hiddenGap = 0;
  s.clarity = s.initialClarity = 100;
  s.techDebt = 0;
  s.quality = 60;
  s.budget = s.initialBudget = s.approvedBudget = 1000;
  s.trust = { steering: 60, ops: 60, vendor: 50 };
  s.turn = 5;
  s.apMax = 4;
  return Object.assign(s, over);
}

export const rng = (seed = 1): Rng => createRng(seed);
export { makeSkills };
