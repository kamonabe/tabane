import { moraleFace } from "../assets";
import { memberCard } from "../components/memberCard";
import { h } from "../dom";
import type { ScreenContext } from "../controller";

const SIZE_LABEL = { small: "小", medium: "中", large: "大" } as const;
const DIFFICULTY_LABEL = { easy: "余裕のある案件", normal: "ふつうの案件", hard: "なかなか無理筋な案件" } as const;

const starsOf = (n: number): string => "★".repeat(n) + "☆".repeat(3 - n);

export function renderSetup(c: ScreenContext): HTMLElement {
  const s = c.game;
  const p = s.profile;
  const t = c.text();
  const uncertainty = p.uncertainty >= 55 ? "大きい" : p.uncertainty >= 35 ? "ふつう" : "小さい";
  const row = (k: string, v: string) => h("div", { class: "kv" }, h("dt", null, k), h("dd", null, v));
  return h(
    "main",
    { class: "screen setup" },
    h("p", { class: "eyebrow" }, "あたらしい案件が届きました"),
    h("h1", { class: "setup-title" }, p.title),
    h(
      "section",
      { class: "panel project-card" },
      h(
        "dl",
        { class: "kvs" },
        row("大きさ", SIZE_LABEL[p.size]),
        row("要件の固まり具合", `${Math.round(s.initialClarity)}%（見積もりのブレ：${uncertainty}）`),
        row("運用への影響", starsOf(p.opsImpact)),
        row("技術の新しさ", starsOf(p.novelty)),
        row("期間", `全体${p.durationMonths}か月（1ターン＝${p.weeksPerTurn}週間）`),
        row("締切", p.deadlineFirm ? "動かしにくい" : "相談の余地あり"),
        row("予算", `${s.initialBudget} 万円`),
        row("この案件は", DIFFICULTY_LABEL[p.difficultyLabel]),
      ),
      h("p", { class: "note" }, t("{mitsumori}は少なめにブレやすいので、{youken}が固まるほど本当の量が見えてきます。")),
    ),
    h("h2", { class: "section-title" }, `メンバ（${s.members.length}人）`),
    h("div", { class: "member-grid" }, ...s.members.map((m) => h("div", { class: "member-wrap" }, memberCard(s, m), h("p", { class: "member-mood" }, `${moraleFace(m.morale)} やる気は${m.morale >= 65 ? "高め" : "ふつう"}`)))),
    h("div", { class: "center" }, h("button", { class: "button", type: "button", onClick: () => c.dispatch({ type: "begin" }) }, "着任する")),
  );
}
