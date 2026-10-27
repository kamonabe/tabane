import { canSetMode } from "../../game/actions";
import { MODES } from "../../game/members";
import type { GameState, Member, Mode, SkillKey, Trait } from "../../game/types";
import { moraleFace, portraitEl } from "../assets";
import { h } from "../dom";
import { meter } from "./meter";

export const SKILL_LABEL: Record<SkillKey, string> = { design: "設計", build: "実装", test: "テスト", domain: "業務", coord: "調整" };
export const EMPLOYMENT_LABEL = { staff: "社員", contractor: "外注", helper: "助っ人" } as const;
export const ARCHETYPE_LABEL = { veteran: "ベテラン", mid: "中堅", junior: "若手" } as const;
export const TRAIT_LABEL: Record<Trait, string> = { careful: "きっちり", normal: "ふつう", optimistic: "楽観的" };
export const MODE_LABEL: Record<Mode, string> = { normal: "ふつう", push: "がんばる", rest: "休む", support: "調整サポート" };
export const MODE_HINT: Record<Mode, string> = {
  normal: "いつものペース",
  push: "出力アップ。そのぶん疲れて、申告もずれやすい",
  rest: "回復する。出力は少しだけ",
  support: "自分の出力は0。調整力が高い人なら、リーダーの時間+1",
};

export function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function skillRow(m: Member): HTMLElement {
  const keys: SkillKey[] = ["design", "build", "test", "domain", "coord"];
  return h(
    "ul",
    { class: "skills" },
    ...keys.map((k) => h("li", { title: `${SKILL_LABEL[k]} ${m.skills[k]}/5` }, h("span", { class: "skill-name" }, SKILL_LABEL[k]), h("span", { class: "skill-stars" }, stars(m.skills[k])))),
  );
}

function statusLine(s: GameState, m: Member): string | null {
  if (m.joinedTurn > s.turn) return "次のターンから参加";
  if (m.awayTurns > 0) return `おやすみ中（あと${m.awayTurns}ターン）`;
  const notes: string[] = [];
  if (m.rampTurns > 0) notes.push("立ち上がり中");
  if (m.leavesAfterTurn !== null && m.leavesAfterTurn >= s.turn) {
    const n = m.leavesAfterTurn - s.turn + 1;
    notes.push(`あと${n}ターンで${m.employment === "helper" ? "戻る" : "契約終了"}`);
  }
  return notes.length ? notes.join("・") : null;
}

export interface MemberCardOptions {
  onMode?: (mode: Mode) => void; // なければ表示のみ
}

export function memberCard(s: GameState, m: Member, opts: MemberCardOptions = {}): HTMLElement {
  const away = m.awayTurns > 0 || m.joinedTurn > s.turn;
  const status = statusLine(s, m);
  return h(
    "article",
    { class: `member${away ? " member-away" : ""}`, "data-member": m.id },
    h(
      "header",
      { class: "member-head" },
      portraitEl(m.portraitId, m.morale < 30 ? "troubled" : m.morale >= 70 ? "happy" : "normal", "md"),
      h(
        "div",
        { class: "member-id" },
        h("strong", { class: "member-name" }, m.name),
        h("span", { class: `badge badge-${m.employment}` }, EMPLOYMENT_LABEL[m.employment]),
        h("span", { class: "badge badge-plain" }, ARCHETYPE_LABEL[m.archetype]),
      ),
      h("span", { class: "member-face", title: "士気", "aria-label": "士気" }, moraleFace(m.morale)),
    ),
    skillRow(m),
    h(
      "div",
      { class: "member-stats" },
      h("span", { class: "stat-label" }, "疲れ"),
      meter(m.fatigue, m.fatigue >= 70 ? "warn" : "plain", "疲労"),
      h("span", { class: "trait" }, m.traitRevealed ? `申告：${TRAIT_LABEL[m.trait]}` : "申告のくせ：？"),
    ),
    status ? h("p", { class: "member-status" }, status) : null,
    opts.onMode && !away
      ? h(
          "div",
          { class: "modes", role: "group", "aria-label": `${m.name}さんの働き方` },
          ...MODES.map((mode) => {
            const check = canSetMode(s, m.id, mode);
            const active = m.mode === mode;
            return h(
              "button",
              {
                type: "button", class: `mode mode-${mode}${active ? " mode-active" : ""}`, "aria-pressed": active,
                disabled: !active && !check.ok, title: check.ok ? MODE_HINT[mode] : check.reason,
                onClick: () => opts.onMode!(mode),
              },
              MODE_LABEL[mode],
            );
          }),
        )
      : h("p", { class: "member-mode-static" }, away ? "" : `働き方：${MODE_LABEL[m.mode]}`),
  );
}
