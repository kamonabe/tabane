import { describe, expect, it } from "vitest";
import { hireCandidate, makeCandidates, negotiateRate, openVendorModal, staffFund } from "./vendor";
import { baseState, fixedRng, rng } from "./testUtils";

const open = (conditional: boolean) => {
  const s = baseState({ turn: 4 });
  openVendorModal(s, rng(2), conditional);
  return s;
};

describe("vendor", () => {
  it("条件付きのときは若手・中堅だけ。通常はベテランも", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const c = makeCandidates(baseState(), rng(seed), true);
      expect(c).toHaveLength(3);
      expect(c.every((x) => x.member.archetype !== "veteran")).toBe(true);
    }
    expect(makeCandidates(baseState(), rng(1), false).map((c) => c.member.archetype)).toEqual(["veteran", "mid", "junior"]);
  });
  it("単価の範囲", () => {
    const [v, m, j] = makeCandidates(baseState(), rng(5), false).map((c) => c.member.ratePerTurn);
    expect(v).toBeGreaterThanOrEqual(120);
    expect(m).toBeLessThanOrEqual(110);
    expect(j).toBeLessThanOrEqual(80);
  });
  it("値下げ相談: 成功は全員 −10% と vendor −2、失敗は vendor −5、1回だけ", () => {
    const s = open(false);
    const before = s.pending?.kind === "vendor" ? s.pending.candidates.map((c) => c.member.ratePerTurn) : [];
    const ok = negotiateRate(s, fixedRng(0));
    expect(ok.trust.vendor).toBe(48);
    if (ok.pending?.kind === "vendor") expect(ok.pending.candidates.map((c) => c.member.ratePerTurn)).toEqual(before.map((r) => Math.round(r * 0.9)));
    const ng = negotiateRate(s, fixedRng(0.99));
    expect(ng.trust.vendor).toBe(45);
    expect(negotiateRate(ok, fixedRng(0))).toBe(ok);
  });
  it("採用: 次のターンから参加、立ち上がり2ターン、条件付きは3ターンで契約終了", () => {
    const a = hireCandidate(open(false), 1);
    const m = a.members[a.members.length - 1];
    expect(m.joinedTurn).toBe(5);
    expect(m.rampTurns).toBe(2);
    expect(m.leavesAfterTurn).toBeNull();
    expect(m.employment).toBe("contractor");
    expect(a.pending).toBeNull();
    const b = hireCandidate(open(true), 0);
    expect(b.members[b.members.length - 1].leavesAfterTurn).toBe(7);
  });
  it("増員の費用は、相場の上限 × 払うターン数（承認は締切まで、条件付きは最長 3 ターン）", () => {
    const s = baseState({ turn: 4, deadline: 12 });
    expect(staffFund(s, "veteran", false)).toBe(140 * 8);
    expect(staffFund(s, "mid", true)).toBe(110 * 3);
    expect(staffFund({ ...s, turn: 11 }, "junior", true)).toBe(80);
  });
});
