import type { ChartPoint } from "../../game/review";

const NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// 申告・本当の進み・計画の折れ線グラフ（素の SVG）
export function progressChart(points: ChartPoint[]): SVGSVGElement {
  const W = 480, H = 240, L = 36, R = 12, T = 12, B = 28;
  const maxTurn = Math.max(1, ...points.map((p) => p.turn));
  const x = (t: number) => L + ((W - L - R) * t) / maxTurn;
  const y = (v: number) => T + (H - T - B) * (1 - Math.min(1, Math.max(0, v)));
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "申告と本当の進みのグラフ" });
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    root.append(svg("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: "chart-grid" }));
    const label = svg("text", { x: L - 6, y: y(g) + 4, class: "chart-label", "text-anchor": "end" });
    label.textContent = `${Math.round(g * 100)}%`;
    root.append(label);
  }
  for (let t = 0; t <= maxTurn; t += maxTurn > 8 ? 2 : 1) {
    const label = svg("text", { x: x(t), y: H - 8, class: "chart-label", "text-anchor": "middle" });
    label.textContent = String(t);
    root.append(label);
  }
  const line = (key: "reported" | "actual" | "planned", cls: string) => {
    const d = points.map((p) => `${x(p.turn).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
    root.append(svg("polyline", { points: d, class: `chart-line ${cls}`, fill: "none" }));
  };
  line("planned", "chart-planned");
  line("reported", "chart-reported");
  line("actual", "chart-actual");
  return root;
}
