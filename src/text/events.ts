// イベントの文（仕様書 7.4）。{{name}} は対象メンバ名、{用語} は用語集の展開。
import type { EventId } from "../game/types";

export type Speaker = "ops" | "boss" | "pm" | "vendor" | "member" | "narrator";

export interface EventText {
  title: string;
  speaker: Speaker;
  body: string;
  choices: { label: string; result: string }[];
  log: string; // 年表に載せる短文
}

export const EVENT_TEXT: Record<EventId, EventText> = {
  opsRequest: {
    title: "運用担当からの追加の要望",
    speaker: "ops",
    body: "運用担当さん「使う人たちから『この画面にもう1つボタンがほしい』って声が出てて…。なんとかなりませんか？」",
    choices: [
      { label: "引き受ける", result: "「ありがとうございます！」やることは増えたけど、信頼は深まった。" },
      { label: "「次の改善で入れませんか」と相談する", result: "「うーん、わかりました…」次のターンは調整に時間がかかりそう。" },
      { label: "今回はお断りする", result: "「そうですか…」運用担当さんは、ちょっとがっかりしている。" },
    ],
    log: "運用担当さんから追加の要望が来た",
  },
  reqRework: {
    title: "「思ってたのと違う」",
    speaker: "ops",
    body: "作った画面を見せたら、運用担当さん「あれ…思ってたのと、ちょっと違うかも」。{temodori}の予感…！",
    choices: [
      { label: "作り直す", result: "ちゃんと向き合って作り直すことにした。作業は増えたけど、すれ違いは減った。" },
      { label: "「今回はこのままで」とお願いする", result: "なんとか納得してもらった。でも、使い勝手に少し不安が残る。" },
    ],
    log: "作ったものを見せたら「思ってたのと違う」と言われた",
  },
  reqDropped: {
    title: "要件の取り下げ",
    speaker: "ops",
    body: "運用担当さん「あの機能、業務のやり方を変えたら、いらなくなりました！」",
    choices: [{ label: "「助かります！」", result: "作らなくてよくなった分、ぐっと楽になった！" }],
    log: "運用担当さんの業務が変わり、要件が1つ取り下げになった",
  },
  memberSick: {
    title: "体調不良",
    speaker: "member",
    body: "{{name}}さんから連絡。「すみません、熱が出てしまって…」",
    choices: [
      { label: "「ゆっくり休んでね」", result: "{{name}}さんは2ターン、しっかり休むことに。「ありがとうございます…」" },
      { label: "「…早めに戻れそう？」", result: "{{name}}さんは1ターンで戻ってくる。でも、まだ本調子じゃなさそう。" },
    ],
    log: "{{name}}さんが体調をくずした",
  },
  quitRisk: {
    title: "「ちょっと、お話いいですか」",
    speaker: "member",
    body: "{{name}}さん「あの…最近ちょっとしんどくて。今後のこと、相談したくて」",
    choices: [
      { label: "じっくり話を聞く", result: "{{name}}さんは、話してすっきりした様子。「聞いてもらえてよかったです」" },
      { label: "「もう少しだけ、がんばってくれないかな」", result: "" },
      { label: "異動の希望を受け入れる", result: "{{name}}さんは、次のターンから別のチームへ。みんなも少し動揺している。" },
    ],
    log: "{{name}}さんから「ちょっとお話が…」と声をかけられた",
  },
  memberGrowth: {
    title: "メンバの成長",
    speaker: "member",
    body: "{{name}}さん、最近ぐんぐん伸びてる！ できることが増えたみたい。",
    choices: [
      { label: "みんなの前でほめる", result: "拍手がおきた！ チームの雰囲気がぱっと明るくなった。" },
      { label: "本人にこっそり伝える", result: "{{name}}さんは、うれしそうにうなずいた。" },
    ],
    log: "{{name}}さんが成長した",
  },
  veteranHelp: {
    title: "ベテランの助っ人",
    speaker: "pm",
    body: "PM「となりのチームのベテランさんが、2ターンだけ手伝ってくれるって。どうする？」（人の貸し借りは、組織ではよくある）",
    choices: [
      { label: "お願いする", result: "ベテランの助っ人さんが、次のターンから加わる。心強い！" },
      { label: "「うちは大丈夫です」", result: "PM「そっか、頼もしいね」。自信のあるところを見せられた。" },
    ],
    log: "となりのチームから、ベテランの助っ人が来てくれた",
  },
  vendorRateUp: {
    title: "単価アップの相談",
    speaker: "vendor",
    body: "外注会社の営業さん「契約更新の時期でして…{{name}}さんの{tanka}を、少し上げさせていただけないでしょうか」",
    choices: [
      { label: "そのまま受け入れる", result: "「ありがとうございます！」関係は良くなったけど、お金の負担は増える。" },
      { label: "交渉する", result: "" },
      { label: "契約を終わりにする", result: "{{name}}さんは、このターンでチームを離れる。営業さんは残念そう。" },
    ],
    log: "外注会社から{{name}}さんの単価アップの相談があった",
  },
  memberSwap: {
    title: "外注要員の入れ替え",
    speaker: "vendor",
    body: "営業さん「申し訳ありません、{{name}}さんが別の案件に移ることになりまして…代わりの者を出します」",
    choices: [
      { label: "{hikitsugi}に時間をとってもらう", result: "しっかり引き継いでもらった。新しい人も、すぐ動けそう。" },
      { label: "資料だけ渡してもらう", result: "資料だけでは伝わらないことも多く、新しい人は少し手間取りそう。" },
    ],
    log: "外注の要員が入れ替わった",
  },
  budgetCut: {
    title: "予算の見直し",
    speaker: "boss",
    body: "組織長「全社で経費を見直すことになってね。悪いけど、予算を少し減らすよ」",
    choices: [
      { label: "そのまま正直にチームに伝える", result: "チームは少しがっかりしたけど、ちゃんと話してもらえたことは伝わった。" },
      { label: "1人ずつ話して伝える", result: "ていねいに伝えたので、受け止めてもらえた。次のターンは話す時間が必要。" },
      { label: "黙っておく", result: "今は何も変わらない。…でも、あとで知られたらどうなるだろう。" },
    ],
    log: "上の決定で、予算が減らされた",
  },
  bossPullIn: {
    title: "前倒しのお願い",
    speaker: "boss",
    body: "組織長「上の都合で、リリースを1ターン早められないかな？」",
    choices: [
      { label: "「やってみます！」", result: "組織長「ありがとう、助かるよ！」…さあ、締切が1ターン早まった。" },
      { label: "根拠を示して、難しいと伝える", result: "" },
      { label: "「範囲を減らせるなら、早められます」", result: "組織長「それでいこう」。範囲を絞って、1ターン早めることになった。" },
    ],
    log: "組織長から、リリースの前倒しをお願いされた",
  },
  bigBug: {
    title: "テストで大きなバグ",
    speaker: "narrator",
    body: "テストで大きな{bug}が見つかった！ チームに緊張が走る…",
    choices: [
      { label: "みんなで直す", result: "みんなで力を合わせて直した。作業は増えたけど、品質は上がった。" },
      { label: "{kaihisaku}で運用にカバーしてもらう", result: "運用担当さんが工夫でしのいでくれることに。でも、負担をかけてしまった。" },
      { label: "延期を相談する", result: "" },
    ],
    log: "テストで大きなバグが見つかった",
  },
};
