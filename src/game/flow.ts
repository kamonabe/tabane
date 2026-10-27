// 画面（モーダル）をまたぐ進行。ゲーム関数を呼ぶ側（UI・シミュレーション）はここを使う。
import { applyMeetingChoice, enterMeeting } from "./meetings";
import { applyEventChoice, rollEvent, startEvent } from "./events";
import { escalate, skipEscalation } from "./escalation";
import { applyRelease, enterRelease, finishCanceled, startExtension } from "./release";
import { hireCandidate, negotiateRate, skipVendor } from "./vendor";
import { isMeetingTurn } from "./phases";
import { nextTurn, resolveTurn } from "./turn";
import type { Rng } from "./random";
import type { EscalationStyle, EscalationType, GameState } from "./types";

// 開いているモーダルがなければ、次の場面へ進める（会議のあとはイベント、そのあとは次のターンかリリース判定）
export function settle(state: GameState, rng: Rng): GameState {
  let s = state;
  for (let guard = 0; guard < 8; guard++) {
    if (s.status === "finished" || s.pending) return s;
    if (s.onceFlags.canceled) return finishCanceled(s);
    if (s.status === "playing") return s;
    if (s.status === "meeting") {
      s = structuredClone(s);
      const ev = rollEvent(s, rng);
      if (ev) {
        startEvent(s, ev);
        return s;
      }
      s.status = "event";
      continue;
    }
    if (s.status === "release") {
      // 延期の上申が通らなかったときは、リリース判定に戻る
      s = structuredClone(s);
      s.pending = { kind: "release", extensionTried: true };
      return s;
    }
    // status === "event": イベントのあと
    if (s.turn >= s.deadline) {
      s = structuredClone(s);
      enterRelease(s);
      return s;
    }
    return nextTurn(s);
  }
  return s;
}

// 「このターンを終える」
export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.status !== "playing" || state.pending) return state;
  const s = resolveTurn(state);
  if (isMeetingTurn(s.turn)) {
    s.status = "meeting";
    enterMeeting(s);
    return s;
  }
  s.status = "meeting"; // 会議のないターンは、そのままイベント判定へ
  return settle(s, rng);
}

export function chooseMeeting(state: GameState, optionId: string, rng: Rng): GameState {
  return settle(applyMeetingChoice(state, optionId), rng);
}

export function chooseEvent(state: GameState, choice: number, rng: Rng): GameState {
  const s = applyEventChoice(state, choice, rng);
  return s === state ? s : settle(s, rng);
}

export function submitEscalation(state: GameState, type: EscalationType, style: EscalationStyle, rng: Rng): GameState {
  const s = escalate(state, type, style, rng);
  return s === state ? s : settle(s, rng);
}

export function dropEscalation(state: GameState, rng: Rng): GameState {
  return settle(skipEscalation(state), rng);
}

export function chooseRelease(state: GameState, id: "auto" | "asis" | "defer" | "extend", rng: Rng): GameState {
  if (id === "extend") return startExtension(state);
  return applyRelease(state, id, rng);
}

export function negotiateVendor(state: GameState, rng: Rng): GameState {
  return negotiateRate(state, rng);
}

export function chooseVendor(state: GameState, index: number | null, rng: Rng): GameState {
  const s = index === null ? skipVendor(state) : hireCandidate(state, index);
  return s === state ? s : settle(s, rng);
}
