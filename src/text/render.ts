// 用語マークアップの展開（仕様書 10.3）。"{stecomi}" → "ステコミ（解説）"
import { GLOSSARY } from "./glossary";

export interface TextContext {
  shown: Set<string>; // その画面ですでに解説を付けた用語ID
  order: string[]; // 展開した順（seenTerms に追加する用）
}

export function createTextContext(): TextContext {
  return { shown: new Set(), order: [] };
}

// {{name}} などの差し込み
export function fillVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => vars[key] ?? m);
}

// 解説は、同じ ctx の中で最初の1回だけ付ける
export function renderText(text: string, ctx: TextContext, vars: Record<string, string> = {}): string {
  return fillVars(text, vars).replace(/\{(\w+)\}/g, (m, id: string) => {
    const term = GLOSSARY[id];
    if (!term) return m;
    if (!ctx.order.includes(id)) ctx.order.push(id);
    if (ctx.shown.has(id)) return term.label;
    ctx.shown.add(id);
    return `${term.label}（${term.description}）`;
  });
}
