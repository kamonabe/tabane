import { describe, expect, it } from "vitest";
import { buildChartSeries, buildTimeline } from "./review";
import { markTermsSeen } from "./derived";
import { createTextContext, renderText } from "../text/render";
import { NOTES } from "../text/notes";
import { GLOSSARY } from "../text/glossary";
import { EVENT_TEXT } from "../text/events";
import { baseState } from "./testUtils";

describe("buildTimeline", () => {
  it("important なログだけ。kind ごとのメモは最初だけ", () => {
    const s = baseState();
    s.log = [
      { turn: 2, kind: "memberSick", text: "a", important: true },
      { turn: 3, kind: "meeting_ontrack", text: "b", important: false },
      { turn: 4, kind: "memberSick", text: "c", important: true },
      { turn: 5, kind: "unknownKind", text: "d", important: true },
    ];
    const rows = buildTimeline(s);
    expect(rows.map((r) => r.text)).toEqual(["a", "c", "d"]);
    expect(rows[0].note).toBe(NOTES.memberSick);
    expect(rows[1].note).toBeNull();
    expect(rows[2].note).toBeNull();
  });
  it("チャート用データは 0 ターン目から", () => {
    const s = baseState();
    s.history = [{ turn: 1, reportedFrac: 0.1, actualFrac: 0.05, plannedFrac: 0, quality: 50, techDebt: 0, trust: s.trust, avgMorale: 60, avgFatigue: 10, budget: 1 }];
    expect(buildChartSeries(s)).toEqual([{ turn: 0, reported: 0, actual: 0, planned: 0 }, { turn: 1, reported: 0.1, actual: 0.05, planned: 0 }]);
  });
  it("イベントの kind はすべてメモがある（体調不良〜バグ）", () => {
    for (const id of Object.keys(EVENT_TEXT)) expect(NOTES[id], id).toBeTruthy();
  });
});

describe("renderText", () => {
  it("解説は1画面で最初の1回だけ付く", () => {
    const ctx = createTextContext();
    const a = renderText("{stecomi}で報告。次の{stecomi}も。", ctx);
    expect(a).toBe("ステコミ（えらい人たちが集まって、進め方を決める会議）で報告。次のステコミも。");
    expect(ctx.order).toEqual(["stecomi"]);
    expect(renderText("{stecomi}", createTextContext())).toContain("（");
  });
  it("{{name}} の差し込みと、未知の語はそのまま", () => {
    const ctx = createTextContext();
    expect(renderText("{{name}}さんと{unknown}", ctx, { name: "ハルカ" })).toBe("ハルカさんと{unknown}");
  });
  it("markTermsSeen は出てきた順に重複なく追加する", () => {
    const s = baseState();
    const t = markTermsSeen(markTermsSeen(s, ["joshin", "review", "joshin"]), ["review", "bug"]);
    expect(t.seenTerms).toEqual(["joshin", "review", "bug"]);
    expect(s.seenTerms).toEqual([]);
  });
  it("文中の {用語} はすべて用語集にある", () => {
    const texts = [...Object.values(EVENT_TEXT).flatMap((e) => [e.title, e.body, e.log, ...e.choices.flatMap((c) => [c.label, c.result])]), ...Object.values(NOTES)];
    for (const t of texts) for (const m of t.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)) expect(GLOSSARY[m[1]], m[1]).toBeDefined();
  });
});
