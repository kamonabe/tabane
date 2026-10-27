// ターン画面に重なるモーダル（会議・イベント・上申・外注交渉・リリース判定・結果カード）
import { ESC_COST, STAFF_FUND_RATE } from "../../game/balance";
import { behind, displayedTotal, plannedFracNow, qualityLabel, reportedFrac, rosterMembers, uncertaintyLabel } from "../../game/derived";
import { approvalScore, availability, ESCALATION_LABEL, ESCALATION_TYPES, effectiveStyle } from "../../game/escalation";
import { eventChoiceEnabled, eventTarget } from "../../game/events";
import { meetingOptions } from "../../game/meetings";
import { releaseOptions, remainingRatio } from "../../game/release";
import { staffFund, staffPayTurns } from "../../game/vendor";
import type { Archetype, EscalationSource, EscalationStyle, EscalationType, GameState } from "../../game/types";
import { EVENT_TEXT } from "../../text/events";
import { choiceButton, modal } from "../components/modal";
import { ARCHETYPE_LABEL, EMPLOYMENT_LABEL, skillRow, TRAIT_LABEL } from "../components/memberCard";
import { diffLineEl, speakerOf } from "../summary";
import type { ScreenContext } from "../controller";
import { portraitEl } from "../assets";
import { h, signed } from "../dom";
import type { Child } from "../dom";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const say = (text: string) => h("p", { class: "say" }, text);

function facts(rows: [string, string][]): HTMLElement {
  return h("dl", { class: "facts" }, ...rows.map(([k, v]) => h("div", { class: "fact" }, h("dt", null, k), h("dd", null, v))));
}

export function renderOverlay(c: ScreenContext): HTMLElement | null {
  const s = c.game;
  if (c.ui.card) return cardModal(c);
  const p = s.pending;
  if (p) {
    switch (p.kind) {
      case "meeting": return meetingModal(c);
      case "event": return eventModal(c);
      case "escalation": return escalationModal(c, p.source, p.types);
      case "vendor": return vendorModal(c);
      case "release": return releaseModal(c);
    }
  }
  if (c.ui.escOpen) return escalationModal(c, "turn", ESCALATION_TYPES);
  return null;
}

function cardModal(c: ScreenContext): HTMLElement {
  const card = c.ui.card!;
  return modal(
    { portraitId: card.portraitId, expression: card.expression },
    [
      ...card.text.split("\n").map((line) => say(line)),
      card.lines.length ? h("ul", { class: "diffs" }, ...card.lines.map(diffLineEl)) : null,
    ],
    [choiceButton("つぎへ", () => c.dispatch({ type: "closeCard" }), { primary: true })],
  );
}

function meetingModal(c: ScreenContext): HTMLElement {
  const s = c.game;
  const t = c.text();
  const kickoff = s.turn === 2;
  const revealed = s.log.some((l) => l.kind === "glossRevealed" && l.turn === s.turn);
  const members = rosterMembers(s);
  const info = kickoff
    ? facts([
        ["見積もり合計", `${displayedTotal(s)}`],
        ["見積もりのブレ", uncertaintyLabel(s.profile.uncertainty)],
        ["体制", `${members.length}人（外注${members.filter((m) => m.employment === "contractor").length}人）`],
        ["予算", `${s.budget} 万円`],
      ])
    : facts([
        ["申告の進み", pct(reportedFrac(s))],
        ["計画では", pct(plannedFracNow(s))],
        ["残り予算", `${s.budget} 万円`],
        ["品質", qualityLabel(s.quality)],
      ]);
  const line = kickoff
    ? "組織長「さて、今回の体制と見通しを聞かせてもらおうか」"
    : revealed
      ? "組織長「…あれ？前回は『順調』って聞いてたけど？」"
      : behind(s) > 0.05
        ? "組織長「進み具合はどうかな？ ちょっと遅れてるように見えるけど…」"
        : "組織長「進み具合はどうかな？」";
  return modal(
    { title: t(kickoff ? "{stecomi}：キックオフ" : "{stecomi}：進み具合の報告"), portraitId: "boss", expression: revealed ? "troubled" : "normal", speaker: "組織長" },
    [say(t(line)), info],
    meetingOptions(s).map((o) =>
      choiceButton(t(o.label), () => c.dispatch({ type: "meeting", optionId: o.id }), { disabled: !o.enabled, hint: o.disabledReason ? t(o.disabledReason) : undefined }),
    ),
  );
}

function eventModal(c: ScreenContext): HTMLElement {
  const s = c.game;
  const p = s.pending;
  if (p?.kind !== "event") throw new Error("not an event");
  const t = c.text();
  const def = EVENT_TEXT[p.eventId];
  const vars = { name: eventTarget(s)?.name ?? "" };
  const sp = speakerOf(s);
  return modal(
    { title: t(def.title, vars), portraitId: sp.portraitId, expression: sp.expression },
    [say(t(def.body, vars))],
    def.choices.map((ch, i) => {
      const en = eventChoiceEnabled(s, p.eventId, i);
      return choiceButton(t(ch.label, vars), () => c.dispatch({ type: "event", choice: i }), { disabled: !en.ok, hint: en.reason });
    }),
  );
}

const GUIDE_LABEL = { good: "通りそう", fair: "五分五分", hard: "きびしそう" } as const;
const TYPE_DESC: Record<EscalationType, string> = {
  addStaff: "外注の人をひとり増やす",
  addBudget: "予算を足してもらう",
  cutScope: "つくる範囲を減らす",
  extendSchedule: "締切を延ばす",
};

function escalationModal(c: ScreenContext, source: EscalationSource, types: EscalationType[]): HTMLElement {
  const s = c.game;
  const t = c.text();
  const onTurn = source === "turn";
  const style: EscalationStyle = effectiveStyle(source, c.ui.escStyle);
  const usable = types.filter((x) => availability(s, x).ok);
  const type = c.ui.escType && usable.includes(c.ui.escType) ? c.ui.escType : (usable[0] ?? null);
  const cost = onTurn ? ESC_COST[style] : 0;
  const canPay = !onTurn || (!s.escalatedThisTurn && s.apUsed + cost <= s.apMax);
  const guide = type ? approvalScore(s, type, style, source) : null;
  const setUi = (patch: object) => c.dispatch({ type: "ui", patch });
  const title = source === "kickoff" ? "人か予算を相談する" : source === "recovery" ? "リカバリ案を相談する" : source === "reestimate" ? "再見積もりの結果を相談する" : source === "release" ? "延期を相談する" : source === "bigBug" ? "延期を相談する" : "上申する";

  const typeButtons = types.map((x) => {
    const av = availability(s, x);
    return h(
      "button",
      {
        type: "button", class: `option${type === x ? " option-active" : ""}`, disabled: !av.ok, "aria-pressed": type === x,
        onClick: () => setUi({ escType: x }),
      },
      h("strong", null, ESCALATION_LABEL[x]),
      h("span", null, av.ok ? TYPE_DESC[x] : (av.reason ?? "")),
    );
  });
  const styleButtons = onTurn
    ? ([["quick", "さっと口頭で相談する", `リーダーの時間 ${ESC_COST.quick}`], ["prepared", "根拠の資料をつくって説明する", `リーダーの時間 ${ESC_COST.prepared}・通りやすい`]] as const).map(([k, label, hint]) =>
        h("button", { type: "button", class: `option${style === k ? " option-active" : ""}`, "aria-pressed": style === k, onClick: () => setUi({ escStyle: k }) }, h("strong", null, label), h("span", null, hint)),
      )
    : [];
  const preview: Child[] = guide
    ? [
        h("p", { class: `guide guide-${guide.guide}` }, "目安：", h("strong", null, GUIDE_LABEL[guide.guide])),
        h("ul", { class: "reasons" }, ...guide.reasons.map((r) => h("li", { class: r.value >= 0 ? "reason-up" : "reason-down" }, h("span", null, r.label.replace(/ [＋−]$/, "")), h("b", null, r.label === "組織長からの信頼" ? `${r.value}` : signed(r.value))))),
      ]
    : [h("p", { class: "note" }, "いまは相談できることがありません。")];
  return modal(
    { title: t(`{joshin}：${title}`), portraitId: "boss", expression: "normal", speaker: "組織長" },
    [
      say(t(onTurn ? "組織長「相談ごと？ 聞こうか」（{joshin}は、通るかどうかが伝え方で変わります）" : "組織長「具体的に、どうしたいのかな？」")),
      h("div", { class: "options" }, ...typeButtons),
      onTurn ? h("div", { class: "options" }, ...styleButtons) : null,
      ...preview,
    ],
    [
      choiceButton(canPay ? "お願いしてみる" : s.escalatedThisTurn ? "このターンはもう相談しました" : "リーダーの時間が足りません", () => c.dispatch({ type: "escalate" }), { disabled: !type || !canPay, primary: true }),
      choiceButton(onTurn ? "やめておく" : "今回は上申しない", () => (onTurn ? setUi({ escOpen: false }) : c.dispatch({ type: "dropEscalation" }))),
    ],
  );
}

function fundEl(s: GameState, archetype: Archetype, conditional: boolean): HTMLElement {
  const payTurns = staffPayTurns(s, conditional);
  return h(
    "p",
    { class: "note" },
    `この人の費用（相場の上限 ${STAFF_FUND_RATE[archetype]}万円 × ${payTurns}ターン = ${staffFund(s, archetype, conditional)}万円）は、組織長が予算に足してくれます。単価が安いほど、余りが出ます`,
  );
}

function vendorModal(c: ScreenContext): HTMLElement {
  const s = c.game;
  const p = s.pending;
  if (p?.kind !== "vendor") throw new Error("not a vendor modal");
  const t = c.text();
  return modal(
    { title: "外注会社との交渉", portraitId: "vendor", expression: "happy", speaker: "営業さん" },
    [
      say("営業さん「ちょうど空いている人が3人います。どの方にしましょう？」"),
      p.conditional ? h("p", { class: "note" }, "条件付きなので、契約は3ターンです。") : null,
      h("p", { class: "note" }, "このゲームの外注さんは「派遣」のイメージで、リーダーが直接お願いできます。（現実の「業務委託」だと、お願いは相手の会社を通します）"),
      h(
        "div",
        { class: "candidates" },
        ...p.candidates.map((cand, i) => {
          const m = cand.member;
          return h(
            "article",
            { class: "candidate" },
            h("header", { class: "member-head" }, portraitEl(m.portraitId, "normal", "md"), h("div", { class: "member-id" }, h("strong", null, m.name), h("span", { class: "badge badge-contractor" }, EMPLOYMENT_LABEL.contractor), h("span", { class: "badge badge-plain" }, ARCHETYPE_LABEL[m.archetype] + (m.archetype === "junior" ? "（育てがいあり）" : "")))),
            skillRow(m),
            h("p", { class: "rate" }, t("{tanka}"), `：${m.ratePerTurn} 万円／ターン`),
            fundEl(s, m.archetype, p.conditional),
            h("p", { class: "note" }, `申告のくせ：${m.traitRevealed ? TRAIT_LABEL[m.trait] : "会ってみないと分からない"}`),
            h("button", { class: "button button-small", type: "button", onClick: () => c.dispatch({ type: "vendorHire", index: i }) }, "この人にお願いする"),
          );
        }),
      ),
      h("p", { class: "note" }, `いまの予算：${s.budget} 万円`),
    ],
    [
      choiceButton(p.negotiated ? "（{tanka}の相談は済みました）".replace("{tanka}", "単価") : t("{tanka}を少し下げてもらえないか相談する"), () => c.dispatch({ type: "vendorNegotiate" }), { disabled: p.negotiated }),
      choiceButton("やっぱり今回は見送る", () => c.dispatch({ type: "vendorHire", index: null })),
    ],
  );
}

function releaseModal(c: ScreenContext): HTMLElement {
  const s = c.game;
  const t = c.text();
  const revealed = s.log.some((l) => l.kind === "glossRevealed" && l.turn === s.turn);
  const remain = remainingRatio(s);
  const opts = releaseOptions(s);
  const auto = opts[0].id === "auto";
  return modal(
    { title: t("{releaseJudge}"), portraitId: "boss", expression: remain > 0.05 ? "troubled" : "happy", speaker: "組織長・運用担当さん" },
    [
      say(auto ? "組織長「全部そろってるね。これなら安心して出せそうだ」" : revealed ? "組織長「…前に『順調』と聞いていたのは、何だったのかな」" : "組織長「さて、出して困らないか、みんなで決めよう」"),
      say(auto ? "運用担当さん「使う側としても、問題なさそうです！」" : "運用担当さん「できていないところは、ちゃんと分かっていると助かります」"),
      facts([
        ["本当の残り", remain <= 0.02 ? "ほぼなし" : pct(remain)],
        ["品質", qualityLabel(s.quality)],
        ["運用担当さんの信頼", `${Math.round(s.trust.ops)}`],
      ]),
    ],
    opts.map((o) => choiceButton(t(o.label), () => c.dispatch({ type: "release", id: o.id }), { disabled: !o.enabled, hint: o.disabledReason, primary: auto })),
  );
}

