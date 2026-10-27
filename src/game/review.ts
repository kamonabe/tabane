// 振り返り画面のためのデータ作り（仕様書 9.1）
import { NOTES } from "../text/notes";
import type { GameState } from "./types";

export interface TimelineRow {
  turn: number;
  text: string;
  note: string | null; // 同じ kind の2回目以降は省略
}

export function buildTimeline(s: GameState): TimelineRow[] {
  const seen = new Set<string>();
  const rows: TimelineRow[] = [];
  for (const l of s.log) {
    if (!l.important) continue;
    let note: string | null = null;
    if (!seen.has(l.kind)) {
      seen.add(l.kind);
      note = NOTES[l.kind] ?? null;
    }
    rows.push({ turn: l.turn, text: l.text, note });
  }
  return rows.sort((a, b) => a.turn - b.turn);
}

export interface ChartPoint {
  turn: number;
  reported: number;
  actual: number;
  planned: number;
}

export function buildChartSeries(s: GameState): ChartPoint[] {
  const start: ChartPoint = { turn: 0, reported: 0, actual: 0, planned: 0 };
  return [start, ...s.history.map((h) => ({ turn: h.turn, reported: h.reportedFrac, actual: h.actualFrac, planned: h.plannedFrac }))];
}
