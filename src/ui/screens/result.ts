import type { Grade } from "../../game/types";
import { ENDINGS } from "../../text/endings";
import { h } from "../dom";
import type { ScreenContext } from "../controller";

export const GRADE_MARK: Record<Grade, string> = { great: "◎", good: "○", meh: "△", bad: "×" };
const GRADE_WORD: Record<Grade, string> = { great: "とてもよい", good: "よい", meh: "もう少し", bad: "ざんねん" };
export const GRADE_LABELS = {
  quality: "品質", cost: "お金", delivery: "納期", scope: "できた範囲", stakeholders: "関係者", team: "チーム",
} as const;

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
      h("div", { class: "kv" }, h("dt", null, "使ったお金"), h("dd", null, `${s.spent} 万円（はじめの予算は ${s.initialBudget} 万円）`)),
      h("div", { class: "kv" }, h("dt", null, "できた範囲"), h("dd", null, `${Math.round(scope * 100)}%`)),
    ),
    h("div", { class: "center" }, h("button", { class: "button", type: "button", onClick: () => c.dispatch({ type: "toReview" }) }, "振り返りへ")),
  );
}
