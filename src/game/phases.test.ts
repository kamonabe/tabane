import { describe, expect, it } from "vitest";
import { isMeetingTurn, phaseOf, plannedFrac } from "./phases";

const expected = (deadline: number) => {
  const out = ["concept", "concept", "requirements", "requirements", "design", "design", "build", "build", "build"];
  for (let t = 10; t < deadline; t++) out.push("test");
  out.push("release");
  return out;
};

describe("phaseOf", () => {
  for (const deadline of [11, 12, 14]) {
    it(`deadline ${deadline} の全ターンが表どおり`, () => {
      expected(deadline).forEach((p, i) => expect(phaseOf(i + 1, deadline)).toBe(p));
    });
  }
  it("ステコミは 2・6・9", () => {
    expect([1, 2, 3, 6, 9, 10].filter(isMeetingTurn)).toEqual([2, 6, 9]);
  });
  it("plannedFrac", () => {
    expect(plannedFrac(4, 12)).toBe(0);
    expect(plannedFrac(12, 12)).toBe(1);
    expect(plannedFrac(8, 12)).toBe(0.5);
    expect(plannedFrac(2, 12)).toBe(0);
  });
});
