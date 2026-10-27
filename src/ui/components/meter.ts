import { h } from "../dom";

// 横棒のメーター。0..100
export function meter(value: number, kind: "good" | "warn" | "plain" = "plain", label?: string): HTMLElement {
  const v = Math.max(0, Math.min(100, value));
  return h(
    "span",
    { class: `meter meter-${kind}`, role: "meter", "aria-valuenow": Math.round(v), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label },
    h("span", { class: "meter-fill", style: { width: `${v}%` } }),
  );
}

// 進捗バー（申告の進みと、計画の目印）
export function progressBar(reported: number, planned: number | null): HTMLElement {
  return h(
    "div",
    { class: "progress", role: "progressbar", "aria-valuenow": Math.round(reported * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
    h("div", { class: "progress-fill", style: { width: `${Math.round(reported * 100)}%` } }),
    planned !== null ? h("div", { class: "progress-plan", style: { left: `${Math.round(planned * 100)}%` }, title: "計画" }) : null,
  );
}
