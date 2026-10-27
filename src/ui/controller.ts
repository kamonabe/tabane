// 状態の保持・dispatch・乱数・再描画（仕様書 10.2）。ゲームの状態を変えるのは src/game/ の関数だけ。
import { addAction, removeAction, setMode } from "../game/actions";
import { markTermsSeen } from "../game/derived";
import { chooseEvent, chooseMeeting, chooseRelease, chooseVendor, dropEscalation, endTurn, negotiateVendor, submitEscalation } from "../game/flow";
import { createRng } from "../game/random";
import type { Rng } from "../game/random";
import { createInitialState } from "../game/setup";
import type { EscalationStyle, EscalationType, Expression, GameState, LeaderAction, Mode } from "../game/types";
import { createTextContext, renderText } from "../text/render";
import type { TextContext } from "../text/render";
import { renderResult } from "./screens/result";
import { renderReview } from "./screens/review";
import { renderSetup } from "./screens/setup";
import { renderTitle } from "./screens/title";
import { renderTurn } from "./screens/turn";
import { diffLines, speakerOf } from "./summary";
import type { DiffLine } from "./summary";

export type Screen = "title" | "setup" | "turn" | "result" | "review";

export interface ResultCard {
  text: string;
  lines: DiffLine[];
  portraitId: string;
  expression: Expression;
}

export type Picker = { kind: "oneOnOne" } | { kind: "coach"; memberId: string | null };

export interface UiState {
  escOpen: boolean;
  escType: EscalationType | null;
  escStyle: EscalationStyle;
  picker: Picker | null;
  card: ResultCard | null;
}

export type Command =
  | { type: "start"; seed: number | null }
  | { type: "begin" }
  | { type: "setMode"; memberId: string; mode: Mode }
  | { type: "add"; action: LeaderAction }
  | { type: "remove"; index: number }
  | { type: "endTurn" }
  | { type: "meeting"; optionId: string }
  | { type: "event"; choice: number }
  | { type: "escalate" }
  | { type: "dropEscalation" }
  | { type: "vendorNegotiate" }
  | { type: "vendorHire"; index: number | null }
  | { type: "release"; id: "auto" | "asis" | "defer" | "extend" }
  | { type: "ui"; patch: Partial<UiState> }
  | { type: "closeCard" }
  | { type: "toReview" }
  | { type: "replay" }
  | { type: "toTitle" };

export type TextFn = (text: string, vars?: Record<string, string>) => string;

// 各画面に渡す材料
export interface ScreenContext {
  game: GameState;
  seed: number;
  ui: UiState;
  dispatch: (cmd: Command) => void;
  // 新しい「1画面ぶん」の用語展開を始める。quiet なら、すでに出てきた用語の解説は省く
  text: (quiet?: boolean) => TextFn;
}

const freshUi = (): UiState => ({ escOpen: false, escType: null, escStyle: "prepared", picker: null, card: null });

export interface Controller {
  start(): void;
}

export function createController(root: HTMLElement): Controller {
  let screen: Screen = "title";
  let game: GameState | null = null;
  let seed = 0;
  let rng: Rng = createRng(0);
  let ui: UiState = freshUi();
  let contexts: TextContext[] = [];

  const text = (quiet = false): TextFn => {
    const ctx = createTextContext();
    if (quiet && game) ctx.shown = new Set(game.seenTerms);
    contexts.push(ctx);
    return (t, vars) => renderText(t, ctx, vars);
  };

  function newGame(nextSeed: number): void {
    seed = nextSeed >>> 0;
    rng = createRng(seed ^ 0x9e3779b9);
    game = createInitialState(seed);
    ui = freshUi();
    screen = "setup";
  }

  // ゲーム関数を呼び、結果カード（結果文＋数字の変化）を作る
  function playStep(fn: (s: GameState) => GameState, expression?: Expression): void {
    if (!game) return;
    const before = game;
    const input = { ...before, lastResult: null };
    const sp = speakerOf(before);
    const after = fn(input);
    if (after === input) return;
    game = after;
    ui = { ...ui, escOpen: false, picker: null, card: null };
    if (after.lastResult) {
      const last = after.escalations[after.escalations.length - 1];
      const escalated = after.escalations.length > before.escalations.length;
      const expr: Expression =
        expression ?? (escalated ? (last.outcome === "approved" ? "happy" : last.outcome === "rejected" ? "troubled" : "normal") : sp.expression);
      ui.card = { text: after.lastResult, lines: diffLines(before, after), portraitId: sp.portraitId, expression: expr };
    }
  }

  function dispatch(cmd: Command): void {
    const scrollY = window.scrollY;
    switch (cmd.type) {
      case "start":
        newGame(cmd.seed ?? Date.now());
        break;
      case "begin":
        screen = "turn";
        break;
      case "setMode":
        if (game) game = setMode(game, cmd.memberId, cmd.mode);
        break;
      case "add":
        if (game) game = addAction(game, cmd.action);
        ui = { ...ui, picker: null };
        break;
      case "remove":
        if (game) game = removeAction(game, cmd.index);
        break;
      case "endTurn":
        if (game) {
          game = endTurn(game, rng);
          ui = { ...ui, picker: null };
        }
        break;
      case "meeting":
        playStep((s) => chooseMeeting(s, cmd.optionId, rng));
        break;
      case "event":
        playStep((s) => chooseEvent(s, cmd.choice, rng));
        break;
      case "escalate":
        if (game && ui.escType) {
          const type = ui.escType;
          const style = ui.escStyle;
          playStep((s) => submitEscalation(s, type, style, rng));
        }
        break;
      case "dropEscalation":
        playStep((s) => dropEscalation(s, rng));
        ui = { ...ui, card: null };
        break;
      case "vendorNegotiate":
        if (game) {
          const before = game;
          const after = negotiateVendor({ ...before, lastResult: null }, rng);
          game = after;
          ui = { ...ui, card: after.lastResult ? { text: after.lastResult, lines: diffLines(before, after), portraitId: "vendor", expression: "normal" } : null };
        }
        break;
      case "vendorHire":
        playStep((s) => chooseVendor(s, cmd.index, rng));
        break;
      case "release":
        playStep((s) => chooseRelease(s, cmd.id, rng));
        break;
      case "ui":
        ui = { ...ui, ...cmd.patch };
        break;
      case "closeCard":
        ui = { ...ui, card: null };
        break;
      case "toReview":
        screen = "review";
        break;
      case "replay":
        newGame(seed);
        break;
      case "toTitle":
        screen = "title";
        game = null;
        ui = freshUi();
        break;
    }
    if (game?.status === "finished" && screen === "turn" && !ui.card) screen = "result";
    render();
    window.scrollTo(0, cmd.type === "begin" || cmd.type === "toReview" || cmd.type === "replay" || cmd.type === "toTitle" ? 0 : scrollY);
  }

  function render(): void {
    contexts = [];
    const ctx: ScreenContext | null = game ? { game, seed, ui, dispatch, text } : null;
    let el: HTMLElement;
    if (screen === "title" || !ctx) el = renderTitle({ dispatch, seed });
    else if (screen === "setup") el = renderSetup(ctx);
    else if (screen === "result") el = renderResult(ctx);
    else if (screen === "review") el = renderReview(ctx);
    else el = renderTurn(ctx);
    root.replaceChildren(el);
    // 出てきた用語を記録する（描画はやり直さない）
    if (game) {
      const ids = contexts.flatMap((c) => c.order);
      game = markTermsSeen(game, ids);
    }
  }

  return { start: render };
}
