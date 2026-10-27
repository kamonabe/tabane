import { debtLabel, qualityLabel } from "../../game/derived";
import { buildChartSeries, buildTimeline } from "../../game/review";
import { GLOSSARY } from "../../text/glossary";
import { progressChart } from "../components/chart";
import { h } from "../dom";
import type { ScreenContext } from "../controller";

export function renderReview(c: ScreenContext): HTMLElement {
  const s = c.game;
  const t = c.text();
  const rows = buildTimeline(s);
  const series = buildChartSeries(s);
  const last = s.history[s.history.length - 1];
  return h(
    "main",
    { class: "screen review" },
    h("p", { class: "eyebrow" }, "振り返り"),
    h("h1", null, "今回のプロジェクトを、ふりかえろう"),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "できごと年表"),
      rows.length === 0
        ? h("p", { class: "note" }, "記録に残るできごとは、ありませんでした。")
        : h("ol", { class: "timeline" }, ...rows.map((r) => h("li", { class: "timeline-row" }, h("span", { class: "tl-turn" }, `ターン${r.turn}`), h("div", { class: "tl-body" }, h("p", null, t(r.text)), r.note ? h("p", { class: "tl-note" }, h("span", null, "▶ 現実ではこういうこと"), r.note) : null)))),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "申告と、本当の進み"),
      progressChart(series),
      h("ul", { class: "legend" }, h("li", { class: "lg-reported" }, "みんなの申告"), h("li", { class: "lg-actual" }, "本当の進み"), h("li", { class: "lg-planned" }, "計画")),
      h("p", { class: "note" }, "二本の線がはなれているところが、「申告」と「実際」のずれ。レビューやテストで少しずつ見えてきます。"),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "数値の答え合わせ"),
      h(
        "dl",
        { class: "kvs" },
        h("div", { class: "kv" }, h("dt", null, "品質"), h("dd", null, `${Math.round(s.quality)}（ゲーム中の表示：${qualityLabel(s.quality)}）`)),
        h("div", { class: "kv" }, h("dt", null, t("{techDebt}")), h("dd", null, `${Math.round(s.techDebt)}（${debtLabel(s.techDebt)}）`)),
        h("div", { class: "kv" }, h("dt", null, t("{youken}の固まり具合")), h("dd", null, `${Math.round(s.clarity)}%（はじめは ${Math.round(s.initialClarity)}%）`)),
        h("div", { class: "kv" }, h("dt", null, "組織長の信頼"), h("dd", null, `${Math.round(s.trust.steering)}`)),
        h("div", { class: "kv" }, h("dt", null, "運用担当さんの信頼"), h("dd", null, `${Math.round(s.trust.ops)}`)),
        h("div", { class: "kv" }, h("dt", null, "外注会社の信頼"), h("dd", null, `${Math.round(s.trust.vendor)}`)),
        s.outcome ? h("div", { class: "kv" }, h("dt", null, "最終品質（負債や未完成を引いたあと）"), h("dd", null, `${Math.round(s.outcome.finalQuality)}`)) : null,
        last ? h("div", { class: "kv" }, h("dt", null, "最後のターンの、みんなの元気"), h("dd", null, `士気 ${Math.round(last.avgMorale)} ／ 疲れ ${Math.round(last.avgFatigue)}`)) : null,
      ),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "出てきた言葉"),
      s.seenTerms.length === 0
        ? h("p", { class: "note" }, "今回は、解説つきの言葉は出てきませんでした。")
        : h("dl", { class: "glossary" }, ...s.seenTerms.filter((id) => GLOSSARY[id]).map((id) => h("div", { class: "gloss-row" }, h("dt", null, GLOSSARY[id].label), h("dd", null, GLOSSARY[id].description)))),
    ),
    h(
      "div",
      { class: "center buttons" },
      h("button", { class: "button", type: "button", onClick: () => c.dispatch({ type: "replay" }) }, "同じ案件でもう一度"),
      h("button", { class: "button button-alt", type: "button", onClick: () => c.dispatch({ type: "start", seed: null }) }, "新しい案件で遊ぶ"),
      h("button", { class: "link", type: "button", onClick: () => c.dispatch({ type: "toTitle" }) }, "タイトルへ"),
    ),
  );
}
