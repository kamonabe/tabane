import type { Command } from "../controller";
import { h } from "../dom";

export function renderTitle(o: { dispatch: (c: Command) => void; seed: number }): HTMLElement {
  const input = h("input", {
    class: "seed-input", type: "text", inputmode: "numeric", placeholder: "空なら毎回ちがう案件", "aria-label": "シード",
    value: o.seed ? String(o.seed) : "",
  });
  const start = () => {
    const n = Number(input.value.trim());
    o.dispatch({ type: "start", seed: input.value.trim() !== "" && Number.isFinite(n) ? n : null });
  };
  return h(
    "main",
    { class: "title" },
    h("div", { class: "title-logo", "aria-hidden": "true" }, "🧵"),
    h("h1", null, "tabane"),
    h("p", { class: "title-sub" }, "チームを束ねて、プロジェクトをリリースまで導こう"),
    h(
      "ol",
      { class: "howto" },
      h("li", null, h("strong", null, "時間を配る"), "　リーダーの時間は毎ターン少しだけ。チームを見るか、まわりと話すか。"),
      h("li", null, h("strong", null, "申告はずれる"), "　みんなの「できました」は、本当の進みとは限らない。"),
      h("li", null, h("strong", null, "困ったら上申"), "　人・お金・範囲・締切は、上の人にお願いして決めてもらおう。"),
    ),
    h("button", { class: "button", type: "button", onClick: start }, "はじめる"),
    h("label", { class: "seed" }, h("span", null, "シード"), input),
  );
}
