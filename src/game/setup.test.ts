import { DIFFICULTY_CAP } from "./balance";
import { describe, expect, it } from "vitest";
import { createInitialState, checkSetup, difficultyOf, validateSetup } from "./setup";

describe("createInitialState", () => {
  it("同じ seed なら同じ初期状態、違う seed なら違う", () => {
    expect(createInitialState(5)).toEqual(createInitialState(5));
    const titles = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(createInitialState(s).members.map((m) => m.skills))));
    expect(titles.size).toBeGreaterThan(1);
  });

  it("1,000 シードで範囲と保証が成り立つ", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const s = createInitialState(seed);
      const n = s.members.length;
      const out = s.members.filter((m) => m.employment === "contractor").length;
      const ranges = { small: [3, 4, 0, 1], medium: [4, 5, 0, 1], large: [5, 6, 1, 2] }[s.profile.size];
      expect(n).toBeGreaterThanOrEqual(ranges[0]);
      expect(n).toBeLessThanOrEqual(ranges[1]);
      expect(out).toBeGreaterThanOrEqual(ranges[2]);
      expect(out).toBeLessThanOrEqual(ranges[3]);
      expect(s.members[0].archetype).toBe("veteran");
      for (const m of s.members) {
        for (const v of Object.values(m.skills)) {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(5);
        }
        expect(m.morale).toBeGreaterThanOrEqual(50);
        expect(m.morale).toBeLessThanOrEqual(75);
        expect(m.fatigue).toBeGreaterThanOrEqual(5);
        expect(m.fatigue).toBeLessThanOrEqual(25);
        if (m.employment === "contractor") expect(m.ratePerTurn).toBeGreaterThanOrEqual(70);
        if (m.employment === "contractor") expect(m.ratePerTurn).toBeLessThanOrEqual(120);
      }
      expect(s.profile.uncertainty).toBeGreaterThanOrEqual(20);
      expect(s.profile.uncertainty).toBeLessThanOrEqual(70);
      expect(s.clarity).toBe(100 - s.profile.uncertainty);
      expect(s.estimateBias).toBeLessThan(0);
      expect(s.trust.vendor).toBe(50);
      expect(validateSetup(s)).toBe(true);
      expect(checkSetup(s)).toEqual({ hasBuilder: true, hasCoordinator: true, slackOk: true, difficultyOk: true });
      expect(difficultyOf(s)).toBeLessThanOrEqual(DIFFICULTY_CAP + 0.01);
    }
  });
});
