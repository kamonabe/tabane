import { actionCost, canAddAction, coachLimitOf, remainingAp } from "../../game/actions";
import {
  behind, contractors, debtLabel, displayedTotal, plannedFracNow, qualityLabel, recentReview,
  reportedFrac, rosterMembers,
} from "../../game/derived";
import { isMeetingTurn, PHASE_ORDER, phaseOf } from "../../game/phases";
import type { CoachSkill, GameState, LeaderAction, Phase } from "../../game/types";
import { moraleFace, portraitEl } from "../assets";
import { memberCard, SKILL_LABEL } from "../components/memberCard";
import { meter, progressBar } from "../components/meter";
import { h } from "../dom";
import type { Child } from "../dom";
import type { ScreenContext, TextFn } from "../controller";
import { renderOverlay } from "./modals";

const PHASE_LABEL: Record<Phase, string> = {
  concept: "構想検討", requirements: "要件定義", design: "設計", build: "開発", test: "テスト", release: "リリース",
};

function header(c: ScreenContext): HTMLElement {
  const s = c.game;
  const phase = phaseOf(s.turn, s.deadline);
  const meeting = isMeetingTurn(s.turn);
  return h(
    "header",
    { class: "turn-head" },
    h(
      "div",
      { class: "turn-title" },
      h("h1", null, `ターン ${s.turn} / ${s.deadline}`),
      h("span", { class: "weeks" }, `（${s.turn * s.profile.weeksPerTurn}週目）`),
      meeting ? h("span", { class: "meeting-mark", title: "このターンの終わりにステコミがあります" }, "🏛 ステコミあり") : null,
    ),
    h(
      "ol",
      { class: "phases", "aria-label": "フェーズ" },
      ...PHASE_ORDER.map((p) => h("li", { class: `phase${p === phase ? " phase-now" : ""}`, "aria-current": p === phase ? "step" : null }, PHASE_LABEL[p])),
    ),
    h(
      "ol",
      { class: "pips", "aria-hidden": "true" },
      ...Array.from({ length: s.deadline }, (_, i) => {
        const t = i + 1;
        return h("li", { class: `pip${t < s.turn ? " pip-done" : ""}${t === s.turn ? " pip-now" : ""}` }, isMeetingTurn(t) ? "🏛" : t === s.deadline ? "🚀" : "");
      }),
    ),
  );
}

function trustRow(label: string, portraitId: string, value: number): HTMLElement {
  return h("div", { class: "trust" }, portraitEl(portraitId, value >= 70 ? "happy" : value < 30 ? "troubled" : "normal", "sm"), h("span", { class: "trust-label" }, label), meter(value, value < 30 ? "warn" : "good", label), h("span", { class: "trust-face" }, moraleFace(value)));
}

function projectPanel(c: ScreenContext, t: TextFn): HTMLElement {
  const s = c.game;
  const rate = contractors(s).reduce((a, m) => a + m.ratePerTurn, 0);
  const frac = reportedFrac(s);
  return h(
    "section",
    { class: "panel project" },
    h("h2", null, "プロジェクト"),
    h("p", { class: "project-name" }, s.profile.title),
    h("div", { class: "block" }, h("div", { class: "label-row" }, h("span", null, "進み具合（みんなの申告）"), h("b", null, `${Math.round(frac * 100)}%`)), progressBar(frac, s.turn >= 4 ? plannedFracNow(s) : null), h("p", { class: "note" }, t(`{mitsumori}の合計：${displayedTotal(s)}　（縦線は計画）`))),
    h("div", { class: "block" }, h("div", { class: "label-row" }, h("span", null, t("{youken}の固まり具合")), h("b", null, `${Math.round(s.clarity)}%`)), meter(s.clarity, "good", "要件の固まり具合")),
    h("dl", { class: "kvs" }, h("div", { class: "kv" }, h("dt", null, "品質"), h("dd", null, qualityLabel(s.quality))), h("div", { class: "kv" }, h("dt", null, t("{techDebt}")), h("dd", null, debtLabel(s.techDebt)))),
    h("div", { class: "block" }, h("div", { class: "label-row" }, h("span", null, "予算（残り）"), h("b", null, `${Math.round(s.budget)} 万円`)), h("p", { class: "note" }, rate > 0 ? `1ターンの支出：${rate} 万円` : "いまは外注の支出はありません")),
    h("div", { class: "block" }, h("h3", null, "まわりの信頼"), trustRow("組織長", "boss", s.trust.steering), trustRow("運用担当さん", "ops", s.trust.ops), trustRow("外注会社", "vendor", s.trust.vendor)),
  );
}

function teamPanel(c: ScreenContext): HTMLElement {
  const s = c.game;
  const roster = rosterMembers(s);
  const canSwitch = !s.pending && s.status === "playing";
  return h(
    "section",
    { class: "panel team" },
    h("h2", null, `チーム（${roster.length}人）`),
    h("div", { class: "member-list" }, ...roster.map((m) => memberCard(s, m, canSwitch ? { onMode: (mode) => c.dispatch({ type: "setMode", memberId: m.id, mode }) } : {}))),
  );
}

interface ActionDef {
  kind: LeaderAction["kind"];
  group: "team" | "coord" | "other";
  label: string;
  desc: string;
}

const ACTIONS: ActionDef[] = [
  { kind: "review", group: "team", label: "レビューする", desc: "{review}で、申告のずれが見える。品質↑・負債↓" },
  { kind: "oneOnOne", group: "team", label: "1on1 をする", desc: "{oneonone}で、士気↑・疲れ↓。申告のくせも分かる" },
  { kind: "coach", group: "team", label: "育てる", desc: "スキル+1。その人の今ターンの出力は半分" },
  { kind: "opsSync", group: "coord", label: "運用とすり合わせ", desc: "{unyou}との信頼↑。{youken}が固まる" },
  { kind: "nemawashi", group: "coord", label: "根回しする", desc: "{nemawashi}で、{joshin}と{stecomi}が有利に" },
  { kind: "vendorTalk", group: "coord", label: "外注会社と話す", desc: "{gaichu}会社との信頼↑" },
  { kind: "handsOn", group: "other", label: "自分で手を動かす", desc: "すぐ進む（+2）。ほかの行動はできなくなる" },
];

function planLabel(s: GameState, a: LeaderAction): string {
  const def = ACTIONS.find((x) => x.kind === a.kind)!;
  if (a.kind === "oneOnOne") return `${def.label}：${s.members.find((m) => m.id === a.memberId)?.name}`;
  if (a.kind === "coach") return `${def.label}：${s.members.find((m) => m.id === a.memberId)?.name}（${SKILL_LABEL[a.skill]}）`;
  return def.label;
}

function picker(c: ScreenContext): HTMLElement | null {
  const s = c.game;
  const pk = c.ui.picker;
  if (!pk) return null;
  const close = h("button", { class: "link", type: "button", onClick: () => c.dispatch({ type: "ui", patch: { picker: null } }) }, "やめる");
  if (pk.kind === "oneOnOne") {
    const list = s.members.filter((m) => canAddAction(s, { kind: "oneOnOne", memberId: m.id }).ok);
    return h("div", { class: "picker" }, h("p", null, "だれと話す？"), h("div", { class: "picker-list" }, ...list.map((m) => h("button", { class: "chip-button", type: "button", onClick: () => c.dispatch({ type: "add", action: { kind: "oneOnOne", memberId: m.id } }) }, `${moraleFace(m.morale)} ${m.name}`)), list.length === 0 ? h("span", { class: "note" }, "話せる人がいません") : null), close);
  }
  if (pk.memberId === null) {
    const list = s.members.filter((m) => !m.left && m.awayTurns === 0 && m.joinedTurn <= s.turn && m.coachedCount < coachLimitOf(m));
    return h("div", { class: "picker" }, h("p", null, "だれを育てる？"), h("div", { class: "picker-list" }, ...list.map((m) => h("button", { class: "chip-button", type: "button", onClick: () => c.dispatch({ type: "ui", patch: { picker: { kind: "coach", memberId: m.id } } }) }, `${m.name}（あと${coachLimitOf(m) - m.coachedCount}回）`)), list.length === 0 ? h("span", { class: "note" }, "育てられる人がいません") : null), close);
  }
  const m = s.members.find((x) => x.id === pk.memberId);
  if (!m) return null;
  const skills = (["design", "build", "test", "domain"] as CoachSkill[]).filter((k) => m.skills[k] < 5);
  return h("div", { class: "picker" }, h("p", null, `${m.name}さんの、どのスキルを伸ばす？`), h("div", { class: "picker-list" }, ...skills.map((k) => h("button", { class: "chip-button", type: "button", onClick: () => c.dispatch({ type: "add", action: { kind: "coach", memberId: m.id, skill: k } }) }, `${SKILL_LABEL[k]}（${m.skills[k]}→${m.skills[k] + 1}）`))), close);
}

function leaderPanel(c: ScreenContext, t: TextFn): HTMLElement {
  const s = c.game;
  const left = remainingAp(s);
  const busy = !!s.pending || s.status !== "playing";
  const groupTitle: Record<ActionDef["group"], string> = { team: "チームを見る", coord: "まわりと調整する", other: "そのほか" };
  const button = (def: ActionDef): HTMLElement => {
    const probe: LeaderAction =
      def.kind === "oneOnOne" ? { kind: "oneOnOne", memberId: s.members.find((m) => !m.left)?.id ?? "" }
        : def.kind === "coach" ? { kind: "coach", memberId: "", skill: "build" }
          : ({ kind: def.kind } as LeaderAction);
    let check = canAddAction(s, probe);
    if (def.kind === "oneOnOne" || def.kind === "coach") {
      const apOk = s.apUsed + 1 <= s.apMax;
      const onceOk = def.kind === "coach" ? !s.plan.some((a) => a.kind === "coach") : true;
      const anyone = s.members.some((m) => !m.left && m.awayTurns === 0 && m.joinedTurn <= s.turn && (def.kind === "oneOnOne" ? !s.plan.some((a) => a.kind === "oneOnOne" && a.memberId === m.id) : m.coachedCount < coachLimitOf(m)));
      check = { ok: apOk && onceOk && anyone && !busy, reason: !apOk ? "リーダーの時間が足りません" : !onceOk ? "育成は1ターンに1回まで" : "対象になれる人がいません" };
    }
    const onClick = () => {
      if (def.kind === "oneOnOne") c.dispatch({ type: "ui", patch: { picker: { kind: "oneOnOne" } } });
      else if (def.kind === "coach") c.dispatch({ type: "ui", patch: { picker: { kind: "coach", memberId: null } } });
      else c.dispatch({ type: "add", action: probe });
    };
    return h("button", { class: `action action-${def.group}`, type: "button", disabled: !check.ok, title: check.ok ? undefined : check.reason, onClick }, h("span", { class: "action-label" }, def.label, h("span", { class: "action-cost" }, `時間${actionCost(probe)}`)), h("span", { class: "action-desc" }, t(def.desc)));
  };
  const groups = (["team", "coord", "other"] as const).map((g) => h("div", { class: `action-group action-group-${g}` }, h("h3", null, groupTitle[g]), ...ACTIONS.filter((a) => a.group === g).map(button)));
  const escCost = s.escalatedThisTurn ? "このターンは相談ずみ" : "時間1〜2";
  groups[1].append(h("button", { class: "action action-coord", type: "button", disabled: busy || s.escalatedThisTurn || left < 1, title: s.escalatedThisTurn ? "上申は1ターンに1回まで" : undefined, onClick: () => c.dispatch({ type: "ui", patch: { escOpen: true } }) }, h("span", { class: "action-label" }, t("{joshin}する"), h("span", { class: "action-cost" }, escCost)), h("span", { class: "action-desc" }, "人・お金・範囲・締切を相談。その場で結果が出る")));
  return h(
    "section",
    { class: "panel leader" },
    h("h2", null, "リーダーの時間"),
    h("div", { class: "ap", "aria-label": `リーダーの時間 残り${left}` }, ...Array.from({ length: s.apMax }, (_, i) => h("span", { class: `ap-dot${i < s.apUsed ? " ap-used" : ""}` }, i < s.apUsed ? "○" : "●")), h("span", { class: "ap-text" }, `残り ${left} / ${s.apMax}`)),
    s.plan.length > 0 ? h("ul", { class: "plan" }, ...s.plan.map((a, i) => h("li", { class: "plan-chip" }, planLabel(s, a), h("button", { class: "plan-remove", type: "button", "aria-label": "取り消す", onClick: () => c.dispatch({ type: "remove", index: i }) }, "×")))) : h("p", { class: "note" }, "やることを選んでください（あとから取り消せます）"),
    picker(c),
    ...groups,
  );
}

// 「気になること」
export function concerns(s: GameState): string[] {
  const out: string[] = [];
  const team = s.plan.some((a) => a.kind === "review" || a.kind === "oneOnOne" || a.kind === "coach");
  if (!team) out.push("このターン、チームを見る行動がまだありません（士気が下がり、申告のずれも大きくなります）");
  if (s.turnsSinceOpsSync >= 2) out.push(`運用さんと${s.turnsSinceOpsSync}ターン話していません`);
  if (contractors(s).length > 0 && s.turnsSinceVendorTalk >= 3) out.push(`外注会社と${s.turnsSinceVendorTalk}ターン話していません`);
  const rate = contractors(s).reduce((a, m) => a + m.ratePerTurn, 0);
  if (rate > 0) {
    const turnsLeft = Math.floor(s.budget / rate);
    if (turnsLeft < s.deadline - s.turn + 1) out.push(`予算はあと${turnsLeft}ターン分`);
  }
  for (const m of rosterMembers(s)) {
    if (m.awayTurns > 0) continue;
    if (m.fatigue >= 70) out.push(`${m.name}さん、疲れがたまっています`);
    else if (m.morale < 35) out.push(`${m.name}さんの元気がありません`);
  }
  if (s.turn >= 5 && !recentReview(s) && s.turn - s.lastReviewTurn >= 3) out.push("しばらく{review}していません。本当の進み具合は見えていますか？");
  if (s.turn >= 5 && behind(s) >= 0.1) out.push("申告の上でも、計画より遅れています");
  if (s.glossDebt > 0) out.push("前に「順調です」と報告したままです…");
  if (s.reestimatePromised && s.turn <= 6) out.push("{stecomi}で、{mitsumori}のやり直しを約束しています");
  return out;
}

function bottom(c: ScreenContext, t: TextFn): HTMLElement {
  const s = c.game;
  const issues = concerns(s);
  const recent = s.log.filter((l) => l.turn === s.turn - 1).slice(-5);
  const busy = !!s.pending || s.status !== "playing";
  return h(
    "section",
    { class: "panel bottom" },
    h("div", { class: "bottom-col" }, h("h2", null, "気になること"), issues.length ? h("ul", { class: "concerns" }, ...issues.map((x) => h("li", null, t(x)))) : h("p", { class: "note" }, "いまのところ、大きな心配はなさそうです。")),
    h("div", { class: "bottom-col" }, h("h2", null, "前のターンのできごと"), recent.length ? h("ul", { class: "recent" }, ...recent.map((l) => h("li", null, t(l.text)))) : h("p", { class: "note" }, "まだ何も起きていません。")),
    h("div", { class: "bottom-end" }, h("button", { class: "button button-big", type: "button", disabled: busy, onClick: () => c.dispatch({ type: "endTurn" }) }, "このターンを終える")),
  );
}

export function renderTurn(c: ScreenContext): HTMLElement {
  const t = c.text(true);
  const overlay: Child = renderOverlay(c);
  return h(
    "main",
    { class: "screen turn" },
    header(c),
    h("div", { class: "columns" }, projectPanel(c, t), teamPanel(c), leaderPanel(c, t)),
    bottom(c, t),
    overlay,
  );
}
