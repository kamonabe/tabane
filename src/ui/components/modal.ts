import type { Expression } from "../../game/types";
import { portraitEl } from "../assets";
import { h } from "../dom";
import type { Child } from "../dom";

export interface ModalOptions {
  title?: string;
  portraitId?: string;
  expression?: Expression;
  speaker?: string; // 立場の名前
}

// 左に人物の絵、右にセリフ、下に選択肢。content はセリフ以下の中身
export function modal(opts: ModalOptions, content: Child[], footer: Child[]): HTMLElement {
  return h(
    "div",
    { class: "overlay", role: "dialog", "aria-modal": "true" },
    h(
      "div",
      { class: "modal" },
      opts.title ? h("h2", { class: "modal-title" }, opts.title) : null,
      h(
        "div",
        { class: "modal-body" },
        opts.portraitId
          ? h("div", { class: "modal-portrait" }, portraitEl(opts.portraitId, opts.expression ?? "normal", "lg"), opts.speaker ? h("span", { class: "speaker" }, opts.speaker) : null)
          : null,
        h("div", { class: "modal-content" }, ...content),
      ),
      h("div", { class: "modal-footer" }, ...footer),
    ),
  );
}

export function choiceButton(label: string, onClick: () => void, opts: { disabled?: boolean; hint?: string; primary?: boolean } = {}): HTMLElement {
  return h(
    "button",
    { class: `choice${opts.primary ? " choice-primary" : ""}`, type: "button", disabled: opts.disabled, onClick },
    h("span", { class: "choice-label" }, label),
    opts.hint ? h("span", { class: "choice-hint" }, opts.hint) : null,
  );
}
