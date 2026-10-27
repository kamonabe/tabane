import type { GameState, Grade } from "../../game/types";
import { ENDINGS } from "../../text/endings";
import { h } from "../dom";
import type { ScreenContext } from "../controller";

export const GRADE_MARK: Record<Grade, string> = { great: "◎", good: "○", meh: "△", bad: "×" };
const GRADE_WORD: Record<Grade, string> = { great: "とてもよい", good: "よい", meh: "もう少し", bad: "ざんねん" };
export const GRADE_LABELS = {
  quality: "品質", cost: "お金", delivery: "納期", scope: "できた範囲", stakeholders: "関係者", team: "チーム",
} as const;

// 使ったお金の内訳（0 の行は出さない）
function costBreakdown(s: GameState): HTMLElement {
  const rows: [string, string][] = [["はじめの予算", `${s.initialBudget}`]];
  if (s.fundedStaff > 0) rows.push(["人を増やした分", `+${s.fundedStaff}`]);
  if (s.budgetCutAmount > 0) rows.push(["予算の見直し", `−${s.budgetCutAmount}`]);
  const notes: string[] = [];
  if (s.unplannedCost > 0) notes.push(`延長したターンの外注費 ${s.unplannedCost} 万円は、予定外の出費として数えました`);
  if (s.budgetAdded > 0) notes.push(`追加でもらった予算 ${s.budgetAdded} 万円は、使ってよい予算に入れていません`);
  if (s.overBudget && s.overBudgetTurn !== null) notes.push(`ターン${s.overBudgetTurn}で予算が尽きて、外注さんの契約が止まりました`);
  return h(
    "section",
    { class: "panel cost-breakdown" },
    h("h2", null, "お金の内訳"),
    h("dl", { class: "kvs" }, ...rows.map(([k, v]) => h("div", { class: "kv" }, h("dt", null, k), h("dd", null, `${v} 万円`)))),
    ...notes.map((n) => h("p", { class: "note" }, n)),
  );
}

export function renderResult(c: ScreenContext): HTMLElement {
  const s = c.game;
  const o = s.outcome;
  if (!o) throw new Error("outcome がありません");
  const ending = ENDINGS[o.endingId];
  const scope = Math.min(1, s.doneWork / Math.max(1, s.originalTotalWork));
  return h(
    "main",
    { class: "screen result" },
    h("section", { class: "panel ending" }, h("div", { class: "ending-emoji", "aria-hidden": "true" }, ending.emoji), h("p", { class: "eyebrow" }, o.canceled ? "プロジェクトの結末" : "リリースおつかれさま"), h("h1", null, ending.title), h("p", { class: "ending-text" }, ending.text)),
    h(
      "ul",
      { class: "grades" },
      ...(Object.keys(GRADE_LABELS) as (keyof typeof GRADE_LABELS)[]).map((k) => {
        const g = o.grades[k];
        return h("li", { class: `grade grade-${g}` }, h("span", { class: "grade-label" }, GRADE_LABELS[k]), h("span", { class: "grade-mark", "aria-label": GRADE_WORD[g] }, GRADE_MARK[g]));
      }),
    ),
    h(
      "dl",
      { class: "panel kvs numbers" },
      h("div", { class: "kv" }, h("dt", null, "リリースしたターン"), h("dd", null, o.canceled ? "（中止）" : `ターン${o.releaseTurn}（予定はターン${s.committedDeadline}）`)),
      h("div", { class: "kv" }, h("dt", null, "使ったお金"), h("dd", null, `${s.spent} 万円 ／ 使ってよい予算 ${s.approvedBudget} 万円`, " ", h("span", { class: "cost-mark", "aria-label": GRADE_WORD[o.grades.cost] }, GRADE_MARK[o.grades.cost]), s.overBudget ? h("span", { class: "over-budget" }, "予算切れ") : null)),
      h("div", { class: "kv" }, h("dt", null, "できた範囲"), h("dd", null, `${Math.round(scope * 100)}%`)),
    ),
    costBreakdown(s),
    h("div", { class: "center" }, h("button", { class: "button", type: "button", onClick: () => c.dispatch({ type: "toReview" }) }, "振り返りへ")),
  );
}
