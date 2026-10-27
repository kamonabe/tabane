// 用語集（仕様書 9.3）
export interface Term {
  label: string;
  description: string;
}

export const GLOSSARY: Record<string, Term> = {
  stecomi: { label: "ステコミ", description: "えらい人たちが集まって、進め方を決める会議" },
  joshin: { label: "上申", description: "自分では決められないことを、上の人にお願いして決めてもらうこと" },
  nemawashi: { label: "根回し", description: "大事な話の前に、関係する人へ個別に話しておくこと" },
  oneonone: { label: "1on1", description: "メンバと1対1でじっくり話す時間" },
  review: { label: "レビュー", description: "できたものを見て、まちがいがないかたしかめること" },
  techDebt: { label: "技術的負債", description: "急いで作ったせいで、あとから直すのが大変になった部分" },
  gaichu: { label: "外注", description: "ほかの会社の人に、仕事を手伝ってもらうこと" },
  tanka: { label: "単価", description: "1人に1ターン手伝ってもらう値段" },
  hikitsugi: { label: "引き継ぎ", description: "いままでの仕事の中身を、次の人に伝えること" },
  scope: { label: "範囲（スコープ）", description: "今回つくるものの中身と量" },
  mitsumori: { label: "見積もり", description: "どれくらいの作業が必要かの予想" },
  youken: { label: "要件", description: "「こういうものがほしい」という中身" },
  temodori: { label: "手戻り", description: "一度作ったものを、作り直すこと" },
  bug: { label: "バグ", description: "プログラムのまちがい" },
  kaihisaku: { label: "回避策", description: "直さずに、使い方の工夫でしのぐ方法" },
  releaseJudge: { label: "リリース判定", description: "作ったものを世に出してよいか、みんなで決める会議" },
  honbanShogai: { label: "本番障害", description: "実際に使われているシステムが止まったり、おかしくなったりすること" },
  unyou: { label: "運用担当", description: "できたシステムを毎日動かし、使う人を支える人たち" },
};
