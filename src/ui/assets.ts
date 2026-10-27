// 絵の差し替え表（仕様書 10.4）。MVP は emoji＋色付きの丸。
// あとで image を入れるだけで、ドット絵に切り替わる。
import type { Expression } from "../game/types";
import { h } from "./dom";

export interface PortraitAsset {
  emoji: string;
  color: string; // style.css の変数
  image?: Partial<Record<Expression, string>>;
}

export const portraits: Record<string, PortraitAsset> = {
  "member-1": { emoji: "🐱", color: "var(--pop-1)" },
  "member-2": { emoji: "🐶", color: "var(--pop-2)" },
  "member-3": { emoji: "🐰", color: "var(--pop-3)" },
  "member-4": { emoji: "🦊", color: "var(--pop-4)" },
  "member-5": { emoji: "🐻", color: "var(--pop-5)" },
  "member-6": { emoji: "🐼", color: "var(--pop-6)" },
  "member-7": { emoji: "🐨", color: "var(--pop-1)" },
  "member-8": { emoji: "🐯", color: "var(--pop-2)" },
  "member-9": { emoji: "🐸", color: "var(--pop-3)" },
  "member-10": { emoji: "🐵", color: "var(--pop-4)" },
  "member-11": { emoji: "🐧", color: "var(--pop-5)" },
  "member-12": { emoji: "🐥", color: "var(--pop-6)" },
  "member-13": { emoji: "🦉", color: "var(--pop-1)" },
  "member-14": { emoji: "🐙", color: "var(--pop-2)" },
  helper: { emoji: "🦸", color: "var(--pop-4)" },
  boss: { emoji: "🧑‍💼", color: "var(--pop-5)" },
  pm: { emoji: "🧑‍🏫", color: "var(--pop-3)" },
  ops: { emoji: "🧑‍🔧", color: "var(--pop-2)" },
  vendor: { emoji: "🤝", color: "var(--pop-6)" },
};

const FALLBACK: PortraitAsset = { emoji: "🙂", color: "var(--pop-1)" };
const BADGE: Record<Expression, string> = { normal: "", happy: "✨", troubled: "💦" };

export function portraitEl(id: string, expression: Expression = "normal", size: "sm" | "md" | "lg" = "md"): HTMLElement {
  const a = portraits[id] ?? FALLBACK;
  const src = a.image?.[expression] ?? a.image?.normal;
  const inner = src
    ? h("img", { src, alt: "", class: "portrait-img" })
    : h("span", { class: "portrait-emoji", "aria-hidden": "true" }, a.emoji);
  return h(
    "span",
    { class: `portrait portrait-${size}`, style: { background: a.color }, "data-expression": expression },
    inner,
    BADGE[expression] ? h("span", { class: "portrait-badge", "aria-hidden": "true" }, BADGE[expression]) : null,
  );
}

export const moraleFace = (morale: number): string => (morale >= 70 ? "😄" : morale >= 50 ? "🙂" : morale >= 30 ? "😟" : "😣");
export const trustFace = moraleFace;
