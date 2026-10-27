# tabane（束ね） 最小の遊べる版（MVP） 仕様書 v1.0

最終更新: 2026-10-27
前提: `docs/design.md` v0.3（とくに 2章・10章）。本書は実装者がそのまま作れることを目的にする。数値はすべて `src/game/balance.ts` の定数に集め、調整しやすくする。

---

## 0. 全体像（1分で読む）

- 1プレイ = **12ターン**（延長で最大14、前倒しで11）。1ターン ≒ 1分、全体で15分前後。
- プレイヤーは毎ターン、**リーダーの時間（行動ポイント、AP）** を「チームを見る行動」と「まわりと調整する行動」に配る。さらにメンバごとの働き方（ふつう／がんばる／休む／調整サポート）を必要なときだけ切り替える。
- 進捗は **メンバの自己申告** で見える。実際とのずれ（隠れた手戻り）はレビューやテストで明らかになる。
- 人・予算・範囲・締切を変えたいときは **上申** する。通るかどうかは上の信頼・説明の準備・根回し・タイミング・状況の裏付けで決まる。
- 区切りに **ステコミ** があり、報告のしかた（正直／リカバリ案つき／ごまかす）を選ぶ。
- 最後に **リリース判定** → 結果（6観点の評価＋名前つきエンディング）→ **振り返り**（できごと年表＋「現実ではこういうこと」＋用語集）。

---

## 1. コアループと、選択が「悩ましい」理由

### 1.1 フェーズとターン（締切 `deadline` は初期12）

| ターン | フェーズ `Phase` | メンバの仕事が向かう先 | 使うスキル |
|---|---|---|---|
| 1–2 | `concept` 構想検討 | 要件の固まり具合 `clarity` | 業務知識 `domain` |
| 3–4 | `requirements` 要件定義 | `clarity` | `domain` |
| 5–6 | `design` 設計 | 作業 `doneWork` | 設計 `design` |
| 7–9 | `build` 開発 | `doneWork` | 実装 `build` |
| 10 〜 deadline−1 | `test` テスト | `doneWork`（残りが0なら品質） | (`build`+`test`)/2 |
| deadline | `release` リリース | `doneWork`（同上） | (`build`+`test`)/2 |

- 延長・前倒しはテスト期間の長さだけが変わる（`phaseOf(turn, deadline)` で判定）。
- ステコミ: **ターン2・6・9の終わり**。リリース判定: **deadlineターンの終わり**。

### 1.2 1ターンの手順

1. **ターン開始**: AP を計算して表示。「気になること」（放置警告・予算警告など）を表示。
2. **プレイヤーの判断**（ここが約1分）
   - メンバの働き方を切り替える（前ターンの設定が残るので、変えたいときだけ）。
   - AP を使って行動を予定に入れる（取り消し可）。上申だけはその場で結果が出る（取り消し不可）。
3. **「このターンを終える」** → `resolveTurn` が決まった順で処理（5.1）。
4. ステコミのターンなら会議モーダル（6章）。
5. イベント判定 → 起きればイベントモーダル（7章）。
6. deadline ターンならリリース判定（8章）。違えば次のターンへ。

### 1.3 なぜ悩ましいか

| 選択 | 得るもの | 失うもの |
|---|---|---|
| 自分で手を動かす | すぐ進む（+2/AP） | チームを見ていないと士気↓・申告のずれ↑。調整も止まる |
| レビュー | ずれが見える・品質↑・負債↓・その回の手戻り半減 | 直接は進まない |
| 1on1 / 育成 | 離脱を防ぐ／後半の戦力↑（早いほど効く） | 今ターンの進捗は増えない（育成は対象の出力半分） |
| 運用とすり合わせ | 要件が固まる→手戻りイベントが減る、運用の信頼↑ | チームの時間が減る |
| 根回し | 上申・ステコミが有利 | 同上 |
| がんばる（残業） | 出力×1.4 | 疲労・士気↓、負債↑、品質↓、申告のずれ↑、体調不良・離脱 |
| 調整サポート | リーダーの AP +1 | そのメンバの出力0 |
| 上申 | 状況を根本から変えられる | AP、失敗時の信頼↓、回数を重ねるほど通りにくい |

チーム側の行動（レビュー／1on1／育成）を1つもしないターンは「リーダーが見てくれない」扱いで士気−3、申告ずれ×1.25。調整側を放置すると運用・外注会社の信頼が毎ターン下がる。AP は4しかないので、両方を毎ターン満たしきれない。

---

## 2. 状態モデル（`src/game/types.ts`）

```ts
export type Phase = "concept" | "requirements" | "design" | "build" | "test" | "release";
export type SkillKey = "design" | "build" | "test" | "domain" | "coord";
export type Skills = Record<SkillKey, number>; // 各 1..5 の整数
export type Mode = "normal" | "push" | "rest" | "support";
export type Trait = "careful" | "normal" | "optimistic"; // きっちり／ふつう／楽観的（申告の盛りぐせ）
export type Archetype = "veteran" | "mid" | "junior";
export type Employment = "staff" | "contractor" | "helper"; // 社員／外注要員／助っ人
export type Size = "small" | "medium" | "large";
export type Level3 = 1 | 2 | 3; // 低・中・高

export interface Member {
  id: string;            // "m1" など
  name: string;          // カタカナの下の名前（9.4 の名前リストから）
  portraitId: string;    // 絵の差し替えキー（10.4）
  employment: Employment;
  archetype: Archetype;
  skills: Skills;
  morale: number;        // 0..100 士気
  fatigue: number;       // 0..100 疲労
  trait: Trait;
  traitRevealed: boolean;// 1on1 で判明
  mode: Mode;
  awayTurns: number;     // >0 の間は休み（出力なし）
  rampTurns: number;     // >0 の間は出力×0.5（立ち上がり）
  coachedCount: number;  // 育成を受けた回数
  ratePerTurn: number;   // 外注のみ。社員・助っ人は0
  leavesAfterTurn: number | null; // このターンの終わりに抜ける（契約終了・助っ人の期限）
  left: boolean;         // 抜けた
  joinedTurn: number;
}

export interface ProjectProfile {
  title: string;         // 抽象的な名前（9.4）
  size: Size;
  uncertainty: number;   // 20..70 要件の不確かさ
  opsImpact: Level3;     // 運用への影響度
  novelty: Level3;       // 技術の新しさ
  durationMonths: 3 | 6 | 9 | 12;
  weeksPerTurn: 1 | 2 | 3 | 4; // = durationMonths / 3（表示用）
  deadlineFirm: boolean; // 締切が動かしにくい
  difficultyLabel: "easy" | "normal" | "hard"; // 余裕のある案件／ふつう／なかなか無理筋
}

export interface Trust { steering: number; ops: number; vendor: number } // 0..100

export interface EscalationRecord {
  turn: number; type: EscalationType; style: EscalationStyle;
  score: number; roll: number; outcome: "approved" | "conditional" | "rejected";
}

export interface GameState {
  seed: number;
  turn: number;               // 1 始まり
  deadline: number;           // 初期12、11..14
  committedDeadline: number;  // 納期評価の基準（初期12、前倒しを受けたら11）
  profile: ProjectProfile;
  members: Member[];
  // 作業
  totalWork: number;          // 本当の総作業量（範囲変更で増減）
  originalTotalWork: number;
  doneWork: number;           // 本当に終わった量
  hiddenGap: number;          // 申告と実際のずれ（申告 = doneWork + hiddenGap）
  estimateBias: number;       // 初期見積もりのずれ（負 = 少なく見積もっている）
  clarity: number;            // 0..100 要件の固まり具合
  initialClarity: number;
  quality: number;            // 0..100
  techDebt: number;           // 0..100
  // お金
  budget: number;             // 残り（万円）
  initialBudget: number;
  budgetAdded: number;
  spent: number;
  overBudget: boolean;        // 予算切れを起こした
  // 関係者
  trust: Trust;
  turnsSinceOpsSync: number;
  turnsSinceVendorTalk: number;
  // AP
  apMax: number;              // このターンの AP（計算済み）
  apUsed: number;
  nextTurnApPenalty: number;  // イベントなどで次ターンの AP を減らす
  plan: LeaderAction[];       // このターンに予定した行動
  escalatedThisTurn: boolean;
  // フラグ
  lastTurnNemawashi: boolean;
  lastReviewTurn: number;     // 未実施なら -99
  glossDebt: number;          // 「順調です」とごまかした回数（未清算）
  honestyCredit: number;      // 正直に遅れを報告した回数
  riskShared: boolean;        // 次の悪い知らせの信頼低下を半分に（1回）
  reestimatePromised: boolean;
  secretNewsTurn: number | null; // 予算削減を黙っていた → このターンに発覚
  escalationCount: number;
  escalations: EscalationRecord[];
  scopeCutTotal: number;      // 上申・イベントで減らした範囲の合計
  deferredScope: number;      // リリース時にあとまわしにした量
  departures: number;         // 離脱した社員・外注の人数（助っ人・契約満了は数えない）
  skillUps: number;           // 育成・成長で上がったスキルの合計
  onceFlags: Record<string, boolean>; // 一度きりイベント用
  eventCounts: Record<string, number>;
  lastEventId: string | null;
  // 進行
  status: "playing" | "meeting" | "event" | "release" | "finished";
  pending: PendingModal | null; // UI に出すモーダル
  outcome: Outcome | null;
  log: LogEntry[];            // 振り返り用
  history: TurnSnapshot[];    // 毎ターン終わりの記録（グラフ用）
  seenTerms: string[];        // 出てきた用語ID
}

export interface TurnSnapshot {
  turn: number; reportedFrac: number; actualFrac: number; plannedFrac: number;
  quality: number; techDebt: number; trust: Trust; avgMorale: number; avgFatigue: number; budget: number;
}

export interface LogEntry {
  turn: number;
  kind: string;      // 振り返りメモのキー（9.2）
  text: string;      // 何が起きたか（短文）
  important: boolean;// 振り返りの年表に載せるか
}
```

### 2.1 派生値（`src/game/derived.ts`、すべて純関数）

- `reportedDone = doneWork + hiddenGap`
- `uncertaintyLeft = phase ∈ {test, release} ? 0 : clamp((100 − clarity) / max(1, 100 − initialClarity), 0, 1)`
- `displayedTotal = round(totalWork × (1 + estimateBias × uncertaintyLeft))` … **画面と上の人が見ている総量**
- `reportedFrac = min(1, reportedDone / displayedTotal)`、`actualFrac = doneWork / totalWork`
- `plannedFrac(t) = clamp((t − 4) / (deadline − 4), 0, 1)`（ターン t の終わり時点の計画）
- `behind = plannedFrac(turn) − reportedFrac`（正 = 遅れ。ターン5以降のみ意味を持つ。4以前は0とする）
- `activeMembers = members.filter(m => !m.left && m.awayTurns === 0)`
- 表示用のぼかし: `quality` と `techDebt` は数値を出さずラベル表示（品質: ≥75「いい感じ」/≥55「ふつう」/≥35「ちょっと心配」/それ未満「あやしい」、負債: ≤15「すっきり」/≤35「ちらほら」/≤60「たまってきた」/それ以上「ずっしり」）。振り返りで実数を見せる。

---

## 3. 初期生成（`src/game/setup.ts` `createInitialState(seed)`）

乱数は `createRng(seed)` 1本を順に使う（呼び出し順を固定してテストで再現できるようにする）。

| 項目 | 生成 |
|---|---|
| size | small / medium / large を等確率 |
| 人数（社員＋外注） | small 3–4, medium 4–5, large 5–6 |
| うち外注 | small 0–1, medium 0–1, large 1–2（末尾のメンバを外注にする） |
| archetype | 1人目は必ず veteran。残りは [mid, mid, junior, veteran] から pick |
| skills | 基準 veteran 4 / mid 3 / junior 2。各スキル = clamp(基準 + randomInt(−1,1), 1, 5) |
| morale / fatigue | randomInt(50,75) / randomInt(5,25) |
| trait | careful / normal / optimistic を等確率 |
| 外注の単価 | randomInt(70,120) 万円/ターン |
| uncertainty | randomInt(20,70)。`clarity = initialClarity = 100 − uncertainty` |
| opsImpact, novelty | randomInt(1,3) |
| durationMonths | pick([3,6,9,12])。weeksPerTurn = durationMonths/3 |
| deadlineFirm | rng() < 0.4 |
| estimateBias | −(uncertainty/100) × (0.2 + 0.2 × rng())（−4%〜−28%。見積もりはいつも少なめにブレる） |
| techDebt | novelty=3 なら 10、それ以外 0 |
| quality | 55 |
| trust | steering randomInt(45,60), ops randomInt(40,60), vendor 50 |

### 3.1 総作業量と「どのシードでも勝ち筋がある」保証

```
nominalCapacity = Σ_members [ 2×(1+design) + 3×(1+build) + 3×(1+(build+test)/2) ] × 0.9
ratio = 1.45 + 0.22 × rng()                         // 1.45..1.67（11.3 参照。当初案は 1.15..1.45）
difficulty = ratio + (uncertainty−45)/200 + (novelty−2)×0.04 + (deadlineFirm ? 0.03 : 0)
if (difficulty > 1.7) ratio −= (difficulty − 1.7)    // 難しさの上限（当初案 1.5。11.3 参照）
totalWork = originalTotalWork = round(nominalCapacity × ratio)
slack = randomInt(150, 400); if (ratio > 1.35) slack = max(slack, 250)
budget = initialBudget = Σ 外注の単価 × 12 + slack
difficultyLabel = difficulty < 1.52 ? "easy" : difficulty < 1.63 ? "normal" : "hard"   // 11.3 参照（当初案は 1.25 / 1.4）
```

保証（`validateSetup` で検査し、満たさなければ同じ rng で引き直す。最大20回、超えたら最後の案で上の補正を強制）:
1. `build ≥ 3` のメンバが1人以上いる。
2. `coord ≥ 3` のメンバが1人以上いる（調整サポートの選択肢が必ずある）。
3. `slack ≥ 150`（外注1人を2ターン以上は雇える）。
4. `difficulty ≤ 1.7`（`DIFFICULTY_CAP`）。

ratio が 1 を超えているのは、nominalCapacity が「隠れた手戻り」「休み」「育成」を含まない名目値だからである。バランス調整の基準は 11章のシミュレーション結果で取る。

---

## 4. プレイヤーの行動（`src/game/actions.ts`）

### 4.1 AP

```
apMax = 4 − (ステコミのターン ? 1 : 0) + min(2, 調整サポート中で coord ≥ 3 の人数) − nextTurnApPenalty
apMax = max(1, apMax)、ターン開始時に nextTurnApPenalty = 0 に戻す
```
調整サポートは「このターン」の AP に即反映（働き方を切り替えた瞬間に増減を表示）。AP を下回る切り替えで既存の予定があふれる場合は、その切り替えを不可にする。

### 4.2 メンバの働き方 `Mode`（AP 不要）

| Mode | 出力係数 | 疲労 | 士気 | ほか |
|---|---|---|---|---|
| normal ふつう | 1.0 | +4 | 60 に向かって ±1 | — |
| push がんばる | 1.4 | +16 | −4 | 品質−1、負債+2、申告ずれ×1.5（作業フェーズのみ） |
| rest 休む | 0.4 | −20 | +3 | — |
| support 調整サポート | 0 | +3 | 60 に向かって ±1 | coord ≥ 3 なら AP+1 |

### 4.3 リーダーの行動 `LeaderAction`

```ts
export type LeaderAction =
  | { kind: "handsOn" } | { kind: "review" }
  | { kind: "oneOnOne"; memberId: string }
  | { kind: "coach"; memberId: string; skill: Exclude<SkillKey, "coord"> }
  | { kind: "opsSync" } | { kind: "nemawashi" } | { kind: "vendorTalk" };
```

| 行動 | AP | 1ターンの上限 | 効果（ターン終了時に適用） | 区分 |
|---|---|---|---|---|
| 自分で手を動かす `handsOn` | 1 | 2 | リーダー出力 +2（フェーズの向かう先に加算。申告ずれは発生しない） | どちらでもない |
| レビュー `review` | 1 | 1 | このターンの申告ずれ発生を×0.5、その後 hiddenGap から min(gap,15) を明らかにする、品質+3、負債−4。`lastReviewTurn = turn` | チーム |
| 1on1 `oneOnOne` | 1 | メンバごとに1 | 対象の士気+15、疲労−5、trait を表示 | チーム |
| 育成 `coach` | 1 | 1 | 対象の指定スキル+1（上限5）、士気+3、このターンの対象の出力×0.5。1人につき2回まで（junior は3回）。`skillUps++` | チーム |
| 運用とすり合わせ `opsSync` | 1 | 1 | ops+5、clarity +12（ターン1–4）/ +8（5以降）、`turnsSinceOpsSync=0` | 調整 |
| 根回し `nemawashi` | 1 | 1 | steering+4。このターンと次のターン、上申とステコミが有利（5章・6章） | 調整 |
| 外注会社と話す `vendorTalk` | 1 | 1 | vendor+5、`turnsSinceVendorTalk=0`。外注が0人でも可（次の追加交渉の準備） | 調整 |
| 上申 `escalate` | 1 or 2 | 1 | 5章。**その場で判定** | 調整 |

制約: 休み中（awayTurns>0）や抜けたメンバは 1on1/育成の対象にできない。予定の合計 AP ≤ apMax。

---

## 5. ターンの処理（`src/game/turn.ts` `resolveTurn(state, rng)`）

### 5.1 処理順（この順を必ず守る。テストで固定する）

1. `teamActed = plan に review / oneOnOne / coach のどれかがある`
2. 育成を適用（スキル+1。出力計算の前）
3. メンバ出力: activeMembers のうち mode≠support の各人
   ```
   skill = phaseSkill(phase, m)            // 1.1 の表
   out = (1 + skill) × modeFactor × (0.7 + morale/200) × fatigueFactor × debtFactor
         × (rampTurns>0 ? 0.5 : 1) × (coach対象 ? 0.5 : 1)
   fatigueFactor = fatigue < 50 ? 1 : fatigue < 80 ? 0.85 : 0.65
   debtFactor = max(0.6, 1 − techDebt/250)
   ```
   ＋ リーダー `2 × handsOn回数`
4. 出力を適用
   - concept / requirements: `clarity += 合計 × 0.3`（上限100）。clarity が100を超える分は、超えた clarity 量を出力に戻した値（超過 ÷ 0.3）の ×0.5 を doneWork へ（先行着手）。
   - design / build / test / release: メンバごとに
     `waste = out × bias(trait) × (push ? 1.5 : 1) × (teamActed ? 1 : 1.25) × (review ? 0.8 : 1)`
     bias: careful 0.08 / normal 0.18 / optimistic 0.30（helper は careful）。（当初案は 0.05 / 0.12 / 0.22、レビュー ×0.5）
     `doneWork += out − waste`、`hiddenGap += waste`（リーダー出力は waste なし）。
     doneWork が totalWork に達したら止め、あふれた出力は `quality += あふれ × 0.25`。
5. レビューの公開: `found = hiddenGap`、`revealed = min(found × 0.5, 15)`、`hiddenGap −= revealed`（hiddenGap は「申告済みだが本当は終わっていない分」。レビューで見えるのは見つけた分の半分だけで、残りは次のレビューやテストまで残る。公開すると申告が下がる＝画面上の進捗が戻る）。`found ≥ 6` なら LogEntry `gapRevealed`（初回のみ important）。
6. テストとリリースのフェーズ: さらに `hiddenGap × 0.4` を自動で公開（テストで実態がばれていく）。
7. 品質と負債（作業フェーズのみ）: `techDebt += novelty + 2×push人数 + (review なし ? 2 : 0) − (review ? 4 : 0)`、`quality += 3×review − push人数`。0..100 に収める。
8. 士気・疲労（4.2 の表）→ 1on1 の効果 → `!teamActed` なら全員士気−3 → `fatigue ≥ 80` の人は士気−3。休み中の人は疲労−15、awayTurns−1。rampTurns−1。
9. 調整の放置
   - `turnsSinceOpsSync++`（opsSync した場合は0）。`≥3` かつ turn≥3 なら ops−4、さらに turn≥5 なら clarity−2。LogEntry `neglectOps`（初回のみ important）。
   - 外注が1人以上いて `turnsSinceVendorTalk ≥ 4` なら vendor−3。
10. お金: `budget −= Σ 外注（left でない）の単価`、`spent += 同額`。budget < 0 になったら外注全員がこのターンで抜ける（departures には数えない）、steering−10、`overBudget = true`、LogEntry `overBudget`。
11. `leavesAfterTurn === turn` のメンバを left にする。
12. `secretNewsTurn === turn` なら全員士気−8、LogEntry `secretNews`。
13. 根回しフラグ: `lastTurnNemawashi = plan に nemawashi がある`。
14. TurnSnapshot を history に追加。plan を空にし apUsed=0。
15. 状態遷移: ステコミのターン（2/6/9）→ `meeting`。そうでなければイベント判定（7.1）→ `event` または次へ。deadline のターンはイベントのあと `release`。

`nextTurn` で turn++、apMax を計算、escalatedThisTurn=false。

---

## 6. 上申（`src/game/escalation.ts`）

### 6.1 上申できること

| type | 内容 | 使える時期 | 承認 | 条件付き承認 |
|---|---|---|---|---|
| `addStaff` 人を増やしたい | 外注要員を1人追加 | いつでも（チーム7人まで） | 外注会社との交渉（6.4）で3人の候補から選ぶ | 候補は若手と中堅のみ、契約3ターン |
| `addBudget` 予算を増やしたい | 予算追加 | いつでも | +250 | +120 |
| `cutScope` 範囲を減らしたい | totalWork を減らす | ターン3以降 | −15%（originalTotalWork 比） | −8% |
| `extendSchedule` 締切を延ばしたい | deadline を延ばす | ターン5以降、deadline<14 | +2（上限14） | +1 |

cutScope は totalWork が reportedDone を下回らないように切る。承認・条件付きどちらでも ops−6（このターンに opsSync を予定していれば −2）、`scopeCutTotal` に加算。

### 6.2 説明のしかた `EscalationStyle`

- `quick` さっと口頭で相談する: 1 AP、ボーナス0
- `prepared` 根拠の資料をつくって説明する: 2 AP、+15
- ステコミ・イベントから開いた上申は AP を使わず、style は `prepared` 扱い。

### 6.3 通りやすさ

```
score = trust.steering
      + (style === "prepared" ? 15 : 0)
      + (根回し: plan に nemawashi あり or lastTurnNemawashi ? 15 : 0)
      + timing   // turn ≤ 2: +15 / turn ≤ 6: 0 / それ以降: −10
      + typeMod  // addStaff 0（ただし budget < 100×残りターン数 なら −15）/ addBudget −10 / cutScope +5 /
                 // extendSchedule 0（deadlineFirm なら −25）
      + justification // addStaff・addBudget・extendSchedule かつ turn ≥ 5 のとき:
                      // behind ≥ 0.10 → +10、behind ≤ 0 → −10（「順調って言ってたよね？」）、それ以外 0
      + (ステコミのリカバリ案から ? 15 : 0)
      + (ターン6のステコミで reestimatePromised ? 20 : 0)
      − 10 × escalationCount（reestimatePromised で開いたものは数えない）
      − (glossDebt > 0 かつ type ≠ cutScope ? 15 : 0)
roll = score + randomInt(rng, −10, 10)
roll ≥ 70 → approved、50..69 → conditional、< 50 → rejected（steering −2）
```

- 上申後: `escalationCount++`、`escalations` に記録、LogEntry `escalation_<outcome>`（important）。
- UI では乱数を除いた `score` を目安として表示: ≥75「通りそう」、55–74「五分五分」、<55「きびしそう」。加点・減点の理由を箇条書きで見せる（例:「根回し済み ＋」「時期が遅い −」）。**どうすれば通りやすいかを体感させるのが目的。**
- セリフ例（承認）: 組織長「わかった。そこまで考えてるなら任せるよ」／（条件付き）「全部は無理だけど、半分ならいいよ」／（却下）「うーん、今回は見送りで。もう少し様子を見せて」

### 6.4 外注会社との交渉（`src/game/vendor.ts`、addStaff 承認時）

候補を生成（条件付きなら若手・中堅のみ）:

| 候補 | archetype | 単価 |
|---|---|---|
| ベテラン | veteran | randomInt(120,140) |
| 中堅 | mid | randomInt(90,110) |
| 若手（育てがいあり） | junior | randomInt(65,80) |

選択肢:
1. 候補から1人選ぶ → 次のターンから参加、rampTurns=1、trait は乱数、morale 60、fatigue 10。条件付きなら `leavesAfterTurn = turn + 3`。
2. 「単価を少し下げてもらえないか相談する」（1回だけ）: `p = vendor/100 + 0.1`。成功: 全候補の単価 −10%、vendor−2。失敗: vendor−5。そのあと1へ。
3. 「やっぱり今回は見送る」: 何も起きない（上申は消費済み）。

**予算の見通し（addStaff）**: `freeBudget = budget − Σ 今いる外注の単価 × 契約が続くターン数（締切まで）`、`rest = deadline − turn`。
- `freeBudget ≥ 100 × rest` → ok（通常どおり）。
- `freeBudget ≥ 65 × min(rest, 3)` → tight: 通りやすさ −15。承認は「条件付き（3ターン限り）」に変わる。
- それ未満 → none: 通りやすさ −50。判定にかかわらず却下（steering −2）。組織長「そのお金はどこから出すの？ 先に予算の話をしてくれる？」
- 外注交渉の候補カードには「いまの予算の空きで約Nターン分（払うのは Mターン）」を出す。足りないときは警告色。
- 外注の契約イメージ: このゲームの外注は「派遣」のように、リーダーが直接お願いできる契約として扱う（用語集と交渉画面に短い注記）。現実の「業務委託・準委任」では、指示は相手の会社を通す。

営業さんのセリフ例:「ちょうど空いている人が3人います。どの方にしましょう？」

---

## 7. 関係者とのやりとり

### 7.1 ステコミ（`src/game/meetings.ts`）

表示名: 「ステコミ（えらい人たちが集まって、進め方を決める会議）」。ターン2・6・9の終わり。登場: 組織長。

共通の前処理（6・9）:
- `glossDebt > 0` かつ `behind ≥ 0.10` なら「清算」: steering −12×glossDebt（riskShared なら半分にして riskShared=false）、glossDebt=0。組織長「…あれ？前回は『順調』って聞いてたけど？」 LogEntry `glossRevealed`（important）。
- 根回し済み（plan に nemawashi or lastTurnNemawashi）なら、この会議の steering の**減少**を半分にする。

**ターン2: キックオフ**（見せるもの: 見積もり `displayedTotal`、見積もりのブレ（uncertainty ≥55「大きい」/≥35「ふつう」/それ未満「小さい」）、体制、予算）

| 選択肢 | 効果 |
|---|---|
| 「この体制でいけます！」 | steering +6 |
| 「厳しいかもしれません。人か予算を相談させてください」 | 上申モーダル（addStaff / addBudget のみ、prepared 扱い、timing +15 が乗る） |
| 「要件が固まったら、見積もりをやり直させてください」 | steering +2、`reestimatePromised = true` |

**ターン6・9: 進み具合の報告**（見せるもの: 申告の進捗 vs 計画、残り予算、品質ラベル）

`behind ≤ 0.02`（順調。`BEHIND_ONTRACK`。当初案 0.05）のとき:

| 選択肢 | 効果 |
|---|---|
| 「順調です」と報告する | steering +5 |
| 「順調ですが、気になる点も共有します」 | steering +3、riskShared = true |

`behind > 0.02`（遅れぎみ）のとき:

| 選択肢 | 効果 |
|---|---|
| 正直に遅れを報告する | steering −4、honestyCredit +1 |
| リカバリ案をつけて報告する ※ | steering +2、上申モーダル（4種から選ぶ、+15、AP不要） |
| 「順調です」と言っておく | steering +5、glossDebt +1 |

※ 条件: 「レビューをこのターンか前のターンにした（`turn − lastReviewTurn ≤ 1`）」または「根回し済み」。満たさないときはボタンを無効にし「根拠になる情報が足りない…（最近レビューしていない）」と出す。

ターン6で reestimatePromised なら、どちらの場合も追加の選択肢「再見積もりの結果を報告する」（steering ±0、上申モーダル 4種、+20、回数ペナルティなし）。

会議のあと steering ≤ 10 なら **中止**（`outcome.canceled = true`、8.4 のエンディングへ）。

### 7.2 運用担当組織

- 毎ターン選べる `opsSync`（4.3）。3ターン放置で信頼と clarity が下がる（5.1-9）。
- 要望・手戻り・取り下げのイベント（7.4 の E1–E3）。
- リリース判定に同席し、あとまわしの判断に反応する（8.1）。
- 運用の満足度は最終評価に入る（8.2）。

### 7.3 外注要員の会社

- `vendorTalk`（4.3）、4ターン放置で vendor 低下。
- 追加の交渉（6.4）、単価相談（E8）、要員の入れ替え（E9、vendor が低いと起きやすい）。

### 7.4 イベント（`src/game/events.ts`）

#### 判定（5.1-15 のあと、ステコミがあればその後）

1. **優先イベント**（起きたらランダムイベントはなし）
   - E4 体調不良: activeMembers の中で疲労最大の人が `fatigue ≥ 80` なら確率 `(fatigue − 70)/100`。
   - E5 「お話が…」: 士気最小の人が `morale < 25` なら確率 0.5。
2. **ランダムイベント**: ターン2以降。確率 0.6（ステコミのターンは 0.3）。条件を満たすものから重みで1つ選ぶ。直前と同じイベントは除外。一度きりのものは `onceFlags`、回数上限は `eventCounts` で管理。

テキスト中の `{用語}` は 10.3 の用語マークアップ。`{name}` は対象メンバ名。

| ID | 名前 | 条件 | 重み |
|---|---|---|---|
| E1 `opsRequest` | 運用担当からの追加の要望 | ターン3–11、最大3回 | 2 + opsImpact |
| E2 `reqRework` | 「思ってたのと違う」 | ターン5–11、clarity < 90 | (100 − clarity)/10 |
| E3 `reqDropped` ★ | 要件の取り下げ | ターン5–9、一度きり | ops ≥ 55 ? 2 : 0.5 |
| E4 `memberSick` | 体調不良 | 優先 | — |
| E5 `quitRisk` | 「ちょっと、お話いいですか」 | 優先 | — |
| E6 `memberGrowth` ★ | メンバの成長 | coachedCount ≥ 1 または junior、1人1回 | 2 |
| E7 `veteranHelp` ★ | ベテランの助っ人 | ターン5–11、一度きり | 1 + (steering ≥ 60 ? 2 : 0) |
| E8 `vendorRateUp` | 単価アップの相談 | 参加済みで契約が続いている外注がいる、ターン4–11、最大2回（対象もその人から選ぶ） | 2 |
| E9 `memberSwap` | 外注要員の入れ替え | 参加済みで契約が続いている外注がいる、ターン4–11、一度きり（対象もその人から選ぶ） | 1 + (vendor < 40 ? 3 : 0) |
| E10 `budgetCut` | 予算の見直し | ターン4–10、一度きり | 1 |
| E11 `bossPullIn` | 前倒しのお願い | ターン5–8、一度きり、deadline = 12 | 1 |
| E12 `bigBug` | テストで大きなバグ | ターン10以降、最大2回 | 0.3 + techDebt/20 + (100 − quality)/30 |

★ = 良いイベント。

#### 各イベントの文と選択肢

**E1 運用担当からの追加の要望**
> 運用担当さん「使う人たちから『この画面にもう1つボタンがほしい』って声が出てて…。なんとかなりませんか？」
- 引き受ける → totalWork +10%（originalTotalWork 比）、ops +8
- 「次の改善で入れませんか」と相談する → 次ターン AP −1、ops −1
- 今回はお断りする → ops −10

**E2 「思ってたのと違う」**（{手戻り}）
> 作った画面を見せたら、運用担当さん「あれ…思ってたのと、ちょっと違うかも」。{手戻り}の予感…！
- 作り直す → totalWork + round((100 − clarity)/5)、ops +3、clarity +5
- 「今回はこのままで」とお願いする → ops −6、quality −3

**E3 ★ 要件の取り下げ**
> 運用担当さん「あの機能、業務のやり方を変えたら、いらなくなりました！」
- 「助かります！」 → totalWork −8%（reportedDone 未満にはしない）、ops +2、scopeCutTotal に加算しない（自然な取り下げ）

**E4 体調不良**
> {name}さんから連絡。「すみません、熱が出てしまって…」
- 「ゆっくり休んでね」 → awayTurns 2、fatigue 10、morale +10
- 「…早めに戻れそう？」 → awayTurns 1、fatigue 50、morale −10

**E5 「ちょっと、お話いいですか」**
> {name}さん「あの…最近ちょっとしんどくて。今後のこと、相談したくて」
- じっくり話を聞く → 次ターン AP −1、morale +30、mode を normal に
- 「もう少しだけ、がんばってくれないかな」 → 50%: このターン終わりに離脱（departures+1）／50%: morale +5
- 異動の希望を受け入れる → このターン終わりに離脱（departures+1）、他の全員 morale −3

**E6 ★ メンバの成長**
> {name}さん、最近ぐんぐん伸びてる！ できることが増えたみたい。
- （対象: 育成したスキルがあればそれ、なければ build が+1。上限5なら次に低いスキル。skillUps+1）
- みんなの前でほめる → 全員 morale +4
- 本人にこっそり伝える → 本人 morale +12

**E7 ★ ベテランの助っ人**
> PM「となりのチームのベテランさんが、2ターンだけ手伝ってくれるって。どうする？」（人の貸し借りは、組織ではよくある）
- お願いする → 次ターンから helper（全スキル4、trait careful、morale 70、fatigue 0、単価0、rampTurns 0、`leavesAfterTurn = turn + 2`）。
- 「うちは大丈夫です」 → steering +2

**E8 単価アップの相談**（{単価}）
> 外注会社の営業さん「契約更新の時期でして…{name}さんの{単価}を、少し上げさせていただけないでしょうか」
- そのまま受け入れる → 単価 +15、vendor +6
- 交渉する → 成功確率 `vendor/100 + 0.2`（直近2ターン以内に vendorTalk していれば +0.1）。成功: 単価 +5、vendor −2／失敗: 単価 +15、vendor −4
- 契約を終わりにする → このターン終わりに抜ける（departures には数えない）、vendor −5

**E9 外注要員の入れ替え**（{引き継ぎ}）
> 営業さん「申し訳ありません、{name}さんが別の案件に移ることになりまして…代わりの者を出します」
- （新メンバ: archetype は mid/junior を pick、単価は同じ、trait 乱数。前の人は left）
- {引き継ぎ}に時間をとってもらう → 次ターン AP −1、新メンバ rampTurns 0
- 資料だけ渡してもらう → 新メンバ rampTurns 2、hiddenGap +5

**E10 予算の見直し**（上からの決定は、納得できなくても受け止めてチームに伝える）
> 組織長「全社で経費を見直すことになってね。悪いけど、予算を少し減らすよ」
- （必ず: budget −= round(initialBudget × 0.15)、下限0）
- そのまま正直にチームに伝える → 全員 morale −3
- 1人ずつ話して伝える → 次ターン AP −1
- 黙っておく → 今は変化なし。`secretNewsTurn = turn + 2`（発覚すると全員 morale −8）

**E11 前倒しのお願い**
> 組織長「上の都合で、リリースを1ターン早められないかな？」
- 「やってみます！」 → deadline −1、committedDeadline −1、steering +10
- 根拠を示して、難しいと伝える → `turn − lastReviewTurn ≤ 1` なら steering ±0、そうでなければ steering −6
- 「範囲を減らせるなら、早められます」 → deadline −1、committedDeadline −1、totalWork −12%、ops −5、steering +5

**E12 テストで大きなバグ**（{バグ}）
> テストで大きな{バグ}が見つかった！ チームに緊張が走る…
- みんなで直す → totalWork +10、quality +5
- {回避策}で運用にカバーしてもらう → ops −8、quality −4
- 延期を相談する → totalWork +10、上申モーダル（extendSchedule 固定、prepared 扱い、AP不要、次ターン AP −1）。deadline=14 なら選択肢を無効化

すべてのイベントは LogEntry（kind = イベントID、important）を残す。イベントはターン処理の後に起きるので、文中の「このターン終わりに抜ける／離脱」は「次のターンが始まる前に left にする」という意味（`nextTurn` の先頭で処理）。「次ターン AP −1」は `nextTurnApPenalty += 1`。

---

## 8. 終わり方と評価（`src/game/release.ts`）

### 8.1 リリース判定（deadline ターンの終わり）

表示名: 「リリース判定（作ったものを世に出してよいか、みんなで決める会議）」。登場: 組織長・運用担当。

1. `hiddenGap` を全部公開（0にする）。`remaining = totalWork − doneWork`、`remainingRatio = remaining / totalWork`。
2. `glossDebt > 0` かつ `remainingRatio > 0.05` なら steering −12×glossDebt（清算）。
3. `remainingRatio ≤ 0.02` なら自動で「予定どおりリリース」。それ以外は選択:

| 選択肢 | 効果 |
|---|---|
| このままリリースする（足りないところは未完成のまま） | `incompleteRatio = remainingRatio` |
| 一部の機能をあとまわしにしてリリースする | `deferredScope = remaining`、ops −(8 + remainingRatio×40)、incompleteRatio = 0 |
| 延期を上申する（deadline < 14 のときだけ） | 上申モーダル（extendSchedule、prepared 扱い、AP不要）。承認・条件付きなら status を playing に戻してゲーム続行（次の deadline でもう一度判定）。却下なら上の2択から選ぶ |

4. steering += 3 × honestyCredit。
5. 品質と本番障害:
   ```
   finalQuality = clamp(quality − techDebt×0.3 − incompleteRatio×60, 0, 100)
   pIncident = clamp((70 − finalQuality)/100 × {1:0.7, 2:1.0, 3:1.3}[opsImpact], 0.03, 0.8)
   ```
   本番障害（{本番障害}）が起きたら ops −20、steering −10、LogEntry `incident`。

### 8.2 評価の6観点（`Grade = "great" | "good" | "meh" | "bad"`、表示は ◎ ○ △ ×）

| 観点 | 計算 | ◎ | ○ | △ |
|---|---|---|---|---|
| 品質 Q | finalQuality（障害ありなら1段階下げる） | ≥80 | ≥65 | ≥45 |
| お金 C | spent / initialBudget（予算を追加してもらうと悪くなる）。overBudget なら × | ≤0.9 | ≤1.0 | ≤1.2 |
| 納期 D | releaseTurn − committedDeadline | 0 | 1 | 2 |
| できた範囲 | `min(1, doneWork / originalTotalWork)` | ≥0.95 | ≥0.85 | ≥0.70 |
| 関係者 | (steering + ops)/2 | ≥70 | ≥55 | ≥40 |
| チーム | 平均士気 − max(0, 平均疲労 − 50) − 20×departures + 5×skillUps（在籍者で計算） | ≥65 | ≥50 | ≥35 |

それ未満は ×。中止のときは D・範囲を ×、ほかは同じ計算。
※「できた範囲」には、範囲を減らした・あとまわしにした・未完成のまま出した、の影響がすべて表れる（追加要望で増えた分は doneWork が増えても上限1）。

### 8.3 Outcome

```ts
export interface Outcome {
  canceled: boolean; releaseTurn: number; incident: boolean;
  finalQuality: number; incompleteRatio: number;
  grades: Record<"quality" | "cost" | "delivery" | "scope" | "stakeholders" | "team", Grade>;
  endingId: EndingId;
}
```

### 8.4 エンディング（上から順に最初に当てはまったもの）

| ID | 条件 | タイトル | 文 |
|---|---|---|---|
| `canceled` | 中止 | プロジェクト、おやすみ | 「いったん止めよう」——ステコミでそう決まった。くやしいけど、止める判断も組織の大事な仕事。次はもっと早めに相談しよう。 |
| `incident` | 本番障害あり | リリースの夜は長かった | 出した直後に電話が鳴りやまない！ 運用さんと一緒に朝まで対応。みんなで食べたカップ麺の味は、たぶん一生忘れない。 |
| `bundled` | 6観点すべて ○ 以上 | みんなで束ねたリリース | 上も、運用さんも、外注さんも、チームも。ばらばらだった糸を、ちゃんと1本に束ねられた。リーダー、おつかれさま！ |
| `burnout` | 納期 ○ 以上 かつ（departures ≥ 1、または チーム × かつ 平均疲労 ≥ 65） | 納期は守った。…みんなは？ | 締切には間に合った。打ち上げの席、なんだか空席が目立つような…。次は休むのも計画に入れよう。 |
| `quiet` | 納期 ○ 以上 かつ チーム ×（離脱も強い疲れもない） | 納期は守った。でも、静かな打ち上げ | 締切には間に合った。でも打ち上げは、なんだか静か。みんなの話をゆっくり聞く時間が取れなかったな。次は1on1で、最初のひとことを聞いてみよう。 |
| `thanked` | 納期 △ 以下 かつ ops ≥ 70 かつ 品質 ○ 以上 | 遅れたけど、運用さんから感謝された | 予定より遅れちゃった。でも運用さんから「使いやすい！ありがとう」の声。遅れの説明は大変だったけど、作ったものは喜ばれた。 |
| `smallStart` | 範囲 △ 以下 かつ 品質 ○ 以上 | 小さく出して、大きく育てる | 全部は入らなかったけど、出したものはしっかり動いている。足りない分は次のリリースで。それも立派な戦略。 |
| `grew` | チーム ◎ かつ skillUps ≥ 3 | チームが育った | 結果は「まあまあ」。でもメンバの顔つきが最初と全然ちがう。次のプロジェクトが、ちょっと楽しみ。 |
| `managed` | それ以外 | なんとかリリース！ | いろいろあったけど、なんとか出せた！ 反省点はあとで振り返ろう。まずは乾杯。 |

---

## 9. 振り返り画面（`src/game/review.ts` ＋ `src/text/`）

### 9.1 構成

1. **できごと年表**: `log` のうち `important` のものをターン順に。各行「ターンn｜何が起きたか｜▶ 現実ではこういうこと（9.2）」。同じ kind の2回目以降はメモを省略。
2. **申告と実際のグラフ**: history の reportedFrac・actualFrac・plannedFrac を折れ線（素の SVG）。「みんなの申告」と「本当の進み」の差がひと目で分かるように。
3. **数値の答え合わせ**: 最終の quality、techDebt、clarity、各 trust の実数（ゲーム中はぼかしていたもの）。
4. **出てきた言葉**（用語集）: seenTerms を出てきた順に「言葉（解説）」で一覧。
5. ボタン:「同じ案件でもう一度」（同じ seed）、「新しい案件で遊ぶ」。

### 9.2 「現実ではこういうこと」メモ（`src/text/notes.ts`、kind → 文）

| kind | メモ |
|---|---|
| `meeting_kickoff` | 最初の説明の場は、体制や予算を相談しやすい数少ないタイミング。あとから言うほど通りにくい。 |
| `meeting_honest` | 遅れを正直に言うのは勇気がいるけど、上の人は「早く知れたこと」に助けられることが多い。 |
| `meeting_recovery` | 「遅れています」だけでなく「こうすれば取り戻せます」を添えると、相談が「判断してもらう話」に変わる。 |
| `meeting_gloss` | 「順調です」と言っておくと、その場はしのげる。でも遅れは消えないので、あとで大きくなって返ってくる。 |
| `glossRevealed` | 現実でも、ごまかした報告がばれると、内容より「信頼」のほうが大きく傷つく。 |
| `escalation_approved` | 上申が通るかは、上の人の信頼・根回し・根拠・タイミングで大きく変わる。中身が同じでも、伝え方で結果が変わる。 |
| `escalation_conditional` | 「半分だけ」「期間限定で」のような条件付きの返事はよくある。上の人も、さらに上や予算の事情を抱えている。 |
| `escalation_rejected` | 却下されても終わりではない。材料をそろえて、時期を見て、もう一度相談するのが普通。 |
| `gapRevealed` | 「9割できてます」から先が長いのは開発あるある。レビューしないと、本当の進み具合は見えない。 |
| `neglectOps` | 使う側（運用）と話さない期間が長いほど、作っているものと欲しいものが、少しずつずれていく。 |
| `opsRequest` | 途中で要望が増えるのは、使う人が具体的なものを見て、やっと必要なものに気づくから。全部は受けられないので「いつ入れるか」を話し合う。 |
| `reqRework` | 「思ってたのと違う」は、最初に要件をすり合わせる時間が足りないと起きやすい。早めに見せるのが一番の予防。 |
| `reqDropped` | 業務のやり方を変えて機能がいらなくなる、という良い取り下げもある。作らないのも立派な成果。 |
| `memberSick` | 無理が続くと、人は本当に倒れる。休ませる判断も、リーダーの仕事。 |
| `quitRisk` | 「ちょっとお話が…」は、たいてい前からサインが出ている。1on1 はそれに気づくための時間でもある。 |
| `memberGrowth` | 人が育つと、チームの力は足し算以上に伸びる。育成はすぐには効かないけど、あとで効いてくる。 |
| `veteranHelp` | 他チームとの人の貸し借りは、組織ではよくある。借りたら、いつかどこかで返すことも。 |
| `vendorRateUp` | 外注の単価は、契約更新のたびに見直されることがある。相手の会社にも事情があり、普段の関係が交渉に効く。 |
| `memberSwap` | 外注の要員は、相手の会社の都合で交代することがある。引き継ぎの手間をどうするかが腕の見せどころ。 |
| `budgetCut` | 上の決定は、納得できなくても受け止めてチームに伝える必要がある。伝え方ひとつで、チームの受け取り方が変わる。 |
| `secretNews` | 悪い知らせは、あとから別ルートで知られるほうが、チームの信頼を大きく損なう。 |
| `bossPullIn` | 「前倒しできない？」は、さらに上や社外の事情から来ることが多い。できること・できないことを根拠つきで返すのが大事。 |
| `bigBug` | テストで大きなバグが見つかるのは、むしろテストがうまく働いた証拠。問題は、直す時間が残っているか。 |
| `overBudget` | 予算を使い切ると、契約は止まる。お金の残りを見ておくのも、リーダーの仕事。 |
| `incident` | 本番障害は、使う人の仕事を止めてしまう。運用への影響が大きいシステムほど、品質に時間をかける理由がある。 |
| `release` | リリース判定では、「全部できたか」より「出して困らないか」を、作る側と使う側で一緒に決める。 |

### 9.3 用語集（`src/text/glossary.ts`、id → 表示名と解説）

| id | 言葉 | 解説 |
|---|---|---|
| `stecomi` | ステコミ | えらい人たちが集まって、進め方を決める会議 |
| `joshin` | 上申 | 自分では決められないことを、上の人にお願いして決めてもらうこと |
| `nemawashi` | 根回し | 大事な話の前に、関係する人へ個別に話しておくこと |
| `oneonone` | 1on1 | メンバと1対1でじっくり話す時間 |
| `review` | レビュー | できたものを見て、まちがいがないかたしかめること |
| `techDebt` | 技術的負債 | 急いで作ったせいで、あとから直すのが大変になった部分 |
| `gaichu` | 外注 | ほかの会社の人に、仕事を手伝ってもらうこと |
| `tanka` | 単価 | 1人に1ターン手伝ってもらう値段 |
| `hikitsugi` | 引き継ぎ | いままでの仕事の中身を、次の人に伝えること |
| `scope` | 範囲（スコープ） | 今回つくるものの中身と量 |
| `mitsumori` | 見積もり | どれくらいの作業が必要かの予想 |
| `youken` | 要件 | 「こういうものがほしい」という中身 |
| `temodori` | 手戻り | 一度作ったものを、作り直すこと |
| `bug` | バグ | プログラムのまちがい |
| `kaihisaku` | 回避策 | 直さずに、使い方の工夫でしのぐ方法 |
| `releaseJudge` | リリース判定 | 作ったものを世に出してよいか、みんなで決める会議 |
| `honbanShogai` | 本番障害 | 実際に使われているシステムが止まったり、おかしくなったりすること |
| `unyou` | 運用担当 | できたシステムを毎日動かし、使う人を支える人たち |

### 9.4 名前・案件名（実在の会社名は使わない）

- メンバ名（重複なしで pick）: ハルカ, ソウタ, ミオ, レン, ユイ, カイト, ナナ, リク, サキ, タイガ, モモ, ジン, アオイ, ケンタ
- 案件名: 「社内の申請をラクにするしくみ」「お問い合わせ受付のしくみ」「在庫をかぞえるしくみ」「会議室よやくのしくみ」「勤怠をつけるしくみ」「お知らせ配信のしくみ」の前に size に応じて「ちょっとした」/（なし）/「大がかりな」をつける。
- 立場の名前: 組織長、PM、運用担当さん、外注会社の営業さん（固有名は付けない）。

---

## 10. 画面と UI の流れ

```
タイトル → 案件カード（初期条件の発表）→ ターン画面 ⇄（上申／会議／イベント／交渉 モーダル）→ リリース判定 → 結果 → 振り返り →（タイトル or もう一度）
```

### 10.1 各画面

1. **タイトル**: ロゴ「tabane」、ひとこと、「はじめる」。小さく「シード」入力（空なら `Date.now()`）。「あそびかた」（3行: 時間を配る／申告はずれる／困ったら上申）。
2. **案件カード**: 案件名、大きさ、要件の固まり具合、運用への影響、技術の新しさ（★1–3）、期間「全体○か月（1ターン＝○週間）」、締切の固さ、予算、難しさラベル（余裕のある案件／ふつうの案件／なかなか無理筋な案件）、メンバカード一覧。「着任する」ボタン。
3. **ターン画面**（1画面で完結。PC 横長前提、幅 960px 以上で3カラム、狭いときは縦積み）
   - 上部: 「ターン n / deadline（○週目）」、フェーズの進行表示（6段の矢印、今のフェーズを強調、ステコミのターンに 🏛 印）。
   - 左「プロジェクト」: 進捗バー（申告）と計画の目印、`見積もり合計 displayedTotal`、要件の固まり具合（％）、品質ラベル、負債ラベル、予算（残り／1ターンの支出）、信頼メーター3つ（組織長・運用・外注会社、顔アイコン＋バー）。
   - 中央「チーム」: メンバカード（絵、名前、社員/外注/助っ人、スキル5つの★、士気の顔 😄🙂😟😣、疲労バー、trait（判明済みなら）、働き方の4択トグル）。休み中は灰色。
   - 右「リーダーの時間」: AP の丸（●○）、行動ボタン（チーム／調整の2グループ、色分け）、対象が要るものはメンバを選ぶ小さなポップアップ。予定した行動はチップで並び、× で取り消し。
   - 下部: 「気になること」（例:「運用さんと3ターン話していません」「予算はあと3ターン分」）、前ターンのできごとログ（3–5行）、「このターンを終える」ボタン。
4. **モーダル共通**: 左に人物の絵（表情差分: `normal` / `happy` / `troubled`）、右にセリフ、下に選択肢ボタン。選んだら結果文と数値の変化（例「組織長の信頼 +5」）を見せて「つぎへ」。
   - 上申モーダル: 種類 → 説明のしかた → 目安（通りそう／五分五分／きびしそう＋理由）→「お願いしてみる」→ 結果。
   - 外注交渉モーダル: 候補3枚（スキル★と単価）、値下げ相談ボタン、見送る。
5. **結果画面**: エンディング名と文、6観点の ◎○△×、主な数値（リリースしたターン、使ったお金、できた範囲％）。「振り返りへ」。
6. **振り返り画面**: 9.1。

### 10.2 UI の作り

- フレームワークなし（今の雛形どおり素の TypeScript + DOM）。`src/ui/` の各画面は `render(state): HTMLElement` と、操作を `dispatch(command)` で返すだけにする。ゲームの状態を変えるのは `src/game/` の関数だけ。
- 状態は1つの `GameState`。`dispatch` → ゲーム関数 → 新しい状態 → 全体を再描画（MVP はこれで十分）。
- 乱数: コントローラ（`src/ui/controller.ts`）が `createRng(seed)` を1本持ち、ゲーム関数に引数で渡す。

### 10.3 用語マークアップ

- 画面に出す文は `"{stecomi}で報告する"` のように書き、`renderText(text, state)` が「ステコミ（えらい人たちが集まって、進め方を決める会議）」に展開する。**同じ用語の解説は、その画面（モーダル1つ・ターン画面1回の描画）で最初の1回だけ**付ける。展開した id は `seenTerms` に追加する（ゲーム側の純関数 `markTermsSeen(state, ids)` を UI から呼ぶ）。
- `{name}` などの差し込みは用語と区別するため `{{name}}` を使う。

### 10.4 絵の差し替え

- `src/ui/assets.ts` に `portraits: Record<portraitId, { emoji: string; color: string; image?: Record<Expression, string> }>`。MVP は emoji＋色付きの丸。あとで `image` を入れるだけでドット絵に切り替わる（`image-rendering: pixelated` は style.css に既存）。
- portraitId: メンバ `member-1`〜`member-14`（名前と対応）、`helper`、`boss`（組織長）、`pm`、`ops`（運用担当）、`vendor`（営業さん）。
- 色は style.css の変数を使い、ポップでやさしい配色を保つ。

---

## 11. バランスの目標と確認結果

### 11.1 目標

| 遊び方 | 期待する結果 |
|---|---|
| 雑（全員ずっと「がんばる」、AP は全部手を動かす、ステコミはごまかす、要望は全部受ける） | ほぼ必ず悪い結末（障害・離脱・未完成） |
| 放置（全員ふつう、AP は全部手を動かす、調整なし、正直に報告） | 多くが悪い結末（運用の信頼が底、品質低い、3割前後が未完成） |
| そこそこ（ふつう＋疲れたら休み、レビュー隔ターン、運用と3ターンおき、上申しない） | 「なんとか」〜悪い結末が中心。上申と育成をしないと届かないことを体感 |
| バランス（疲れたら休み、毎ターン何かしらチーム行動、序盤は育成、運用と2ターンおき、ステコミ前に根回し、遅れたらリカバリ案で上申） | 6–9割で良い結末（`bundled` 相当） |

### 11.2 確認結果（`docs` 外のスクリプトで本仕様の主要式を簡略化して2,000シード試行）

| 遊び方 | 良い結末 | 悪い結末 | 平均 最終品質 | 平均 未完成率 | 障害率 | 平均離脱 |
|---|---|---|---|---|---|---|
| 雑 | 0% | 100% | 0 | 61% | 66% | 3.0人 |
| 放置 | 0% | 100% | 26 | 31% | 43% | 0 |
| そこそこ | 1% | 88% | 48 | 26% | 22% | 0 |
| バランス | 84% | 3% | 81 | 1% | 3% | 0（延長を使うのは24%のゲーム） |

（良い = 最終品質≥65・未完成≤5%・障害なし・離脱なし・延長≤1・予算内・steering と ops ≥50。簡略版ではイベントは体調不良・離脱・手戻り・追加要望のみ。）

所見と実装後の調整指針:
- 雑な遊び方は確実に崩れる（疲労→体調不良→離脱、負債→品質→障害）。狙いどおり。
- 「そこそこ」が厳しめ。主因は (a) 追加要望を全部受けること、(b) 序盤の育成をしないこと、(c) 上申しないこと。これは学ばせたい点なので残すが、実プレイで厳しすぎたら `ratio` の範囲を 1.10–1.40 に下げる（簡略版では「そこそこ」の未完成率が約3ポイント下がる）。
- 育成（序盤）の効果が大きい。強すぎたら育成の上限を1人1回にする。
- 実装後は 12.2 の `balance.test.ts` で同じ4戦略を回し、上の目標から外れたら `balance.ts` の定数で直す。

### 11.3 調整後の値と理由（`balance.ts` の最終値。この節は 3.1・6.3・6.4・7.4・8.1・8.2・11.1 より優先する）

#### 11.3.1 何が問題だったか（2回目のレビュー、各 300 シード）

- **上申が、ゲーム自身の結末で得にならなかった。** `balancedNoEscalation` の `bundled` 72% に対し、`balanced` は 54%。増員は予算を食って「お金 ×」に、延長は `committedDeadline` が動かないので「納期 △」に、範囲の削減は「できた範囲」を下げる。シミュレーション側の「良い結末」を「減らした範囲は数えない」に変えて上申が効いて見えていたが、これは結論ありきの物差しだった。
- **お金。** 増員の可否は `freeBudget` で見ていたが、`budgetCut`（−15%）と単価アップを見込んでいなかった。ふつうの初心者でも 50% のゲームで予算切れになり、結果画面は「使ったお金 1287（はじめの予算 1504）→ ×」と、理由のわからない表示になっていた。
- **初めての人にきびしすぎた。** 「ふつうに気をつける初心者」で `bundled` 9%、放置で障害 46%。

#### 11.3.2 物差し: ゲーム自身の結末だけで測る

- バランスの物差しは `release.ts` の結末そのもの。**主指標は `bundled`（6観点すべて ○ 以上）の割合**。「良い・中立の結末」（`thanked` `smallStart` `grew` `managed` `quiet`）と「はっきり悪い結末」（`canceled` `incident` `burnout`）の割合も見る。
- `sim/strategies.ts` の `isGoodOutcome` と `unfinishedRatio`（減らした範囲を数えない版）は**削除**する。テストは `outcome.endingId` だけを見る。
- 「できた範囲」の評価は、仕様どおり `doneWork / originalTotalWork` のまま（減らした・あとまわしにした分もすべて表れる）。範囲を減らすのは「小さく出す」（`smallStart`）への正しい道で、`bundled` への近道ではない。これは学びとして残す。現実でも、範囲を減らせば「全部入り」とは言えないため。

#### 11.3.3 上申のルール（6章の変更）

ねらい: 「早めに、根拠をもって相談すれば、組織は人と時間を出してくれる。ただし、ただでは出てこない」を体で覚えてもらう。上申は**承認された内容を「新しい約束」にする**。新しい約束は、守れば評価され、約束の外の出費は約束の外として数える。

**増員（addStaff）: 人の費用ごと承認される**
- 承認・条件付き承認で採用したとき、その人の費用を組織長が予算に足す: `fund = 相場の上限 × 払うターン数`。相場の上限は `STAFF_FUND_RATE = { veteran: 140, mid: 110, junior: 80 }`（= `VENDOR_RATES` の上限）。払うターン数は、承認なら `deadline − turn`、条件付きなら `min(3, deadline − turn)`。`budget` と `approvedBudget`（下のお金のルール）の両方に `fund` を足す。単価が相場より安い人や、値下げ相談が通った人なら、差額が予算の余りになる（値下げ相談の意味が残る）。
- 本当のコスト（すべて実装する）:
  - 立ち上がり `HIRE_RAMP_TURNS = 2`（2ターンは出力×0.5。当初は1）。
  - 受け入れ準備 `HIRE_ONBOARD_AP = 1`: 採用した次のターン、リーダーの AP −1（`nextTurnApPenalty += 1`）。
  - 通りやすさ `ESC_STAFF_MOD = −5`（「人とお金の両方の相談」）。予算の見通しによる −15 / −50 と、強制却下・強制「期間限定」は**廃止**（`hireAffordability`、`HIRE_COMFORT_RATE`、`HIRE_MIN_RATE` を削除）。
  - 上申の回数 −10 が、あとの延長の相談に効く。新しい人の申告のくせ（楽観的なら「9割できてます」が大きい）と、外注会社とのつきあい（単価アップ・入れ替え・放置）がついてくる。
- そのため、早い増員（キックオフ）ほど効き、遅い増員はほとんど効かない（増員は早めに、という学び）。
- 承認のセリフ: 組織長「わかった。その人の費用は予算に足しておくよ。そのぶん、しっかり頼むね」。

**延長（extendSchedule）: リリース判定より前に通れば「計画変更」**
- リリース判定より前（ターン画面・ステコミ・再見積もり・`bigBug` から）に承認・条件付き承認されたら、`deadline` と一緒に **`committedDeadline` も同じだけ動かす**。`replanned = true`。
- 本当のコスト:
  - 納期の評価は、計画を変えたゲームでは最高でも ○（◎ にはならない）。
  - 運用担当の信頼 `EXTEND_OPS = −3`（運用さんの予定がずれる）。
  - **延びたターンの外注費は「予定外の出費」**: 続いている外注さんの単価の合計 × 延びたターン数を `budget` には足す（予算切れにはしない）が、`approvedBudget` には足さない。お金の評価が下がりうる（バランス戦略で約 26% のゲームがお金 △）。
- リリース判定から開いた延期は、これまでどおり「遅れ」: `committedDeadline` は動かさない。延びたターンの外注費は `budget` に足す（予算切れにはしない）が、`approvedBudget` には足さない。
- 学び: 「早めに相談した延長は、組織が合意した計画変更。ぎりぎりの延長は、ただの遅れ」。

**範囲の削減（cutScope）・予算の追加（addBudget）**: 数値は変えない。addBudget の額は `budget` には入るが `approvedBudget` には入らない（仕様どおり「予算を追加してもらうと、お金の評価は悪くなる」）。

#### 11.3.4 お金のルール（6.4・7.4・8.2 の変更）

- 新しい状態 `approvedBudget`（使ってよい予算。はじめは `initialBudget`）。増える・減るのは: 増員の費用（+`fund`）、予算の見直し（−削減額）だけ。表示と振り返りのため、内訳 `fundedStaff` `budgetCutAmount` `unplannedCost`（延長による予定外の外注費）、`overBudgetTurn`（予算が尽きたターン、なければ null）、`replanned` も持つ。
- **お金の評価 = `spent / approvedBudget`**（◎ ≤0.9、○ ≤1.0、△ ≤1.2）。`overBudget` なら ×（変わらず）。
- **予算の見直し（budgetCut）は、使っていない分から**: 削減額 = `min(round(initialBudget × 0.15), round(freeBudget × 0.5))`。`freeBudget < 100` のときはこのイベントを出さない。`budget` と `approvedBudget` の両方から引く。
- **単価アップ（vendorRateUp）は、払えるときだけ**: `freeBudget ≥ 15 × (deadline − turn)` のときだけ重みを持つ。受けた値上げ分は `approvedBudget` に入らない（お金の評価に表れる）。
- この3つで、予算切れはプレイヤーの選択の結果としてもほぼ起きなくなる（全戦略で 0%）。予算切れの処理（契約停止・steering −10）は安全のために残す。
- **結果画面のお金の欄**（「はじめの予算」を基準に見せない）:
  - 1行目: `使ったお金 {spent} 万円 ／ 使ってよい予算 {approvedBudget} 万円` と評価。
  - 内訳（0 の行は出さない）: `はじめの予算 {initialBudget}`、`人を増やした分 +{fundedStaff}`、`予算の見直し −{budgetCutAmount}`。
  - 予定外の出費があれば: `延長したターンの外注費 {unplannedCost} 万円は、予定外の出費として数えました`。追加の予算をもらっていれば: `追加でもらった予算 {budgetAdded} 万円は、使ってよい予算に入れていません`。
  - 予算切れなら、評価の横に赤いラベル **「予算切れ」** と `ターン{overBudgetTurn}で予算が尽きて、外注さんの契約が止まりました`。
- 外注交渉の候補カード: 「この人の費用（相場の上限 {rate}万円 × {payTurns}ターン = {fund}万円）は、組織長が予算に足してくれます。単価が安いほど、余りが出ます」。`budgetCoverage` の警告表示は廃止。
- 上申の通りやすさ表示から「残り予算がきびしい −」「予算が足りず、人の費用が払えない −」を消し、「人とお金の両方の相談 −」を出す。

#### 11.3.5 難しさと本番障害（3.1・8.1 の変更）

| 定数 | 前回 | 最終 | 理由 |
|---|---|---|---|
| `RATIO_MIN` / `RATIO_SPREAD` | 1.25 / 0.22 | **1.45** / 0.22（1.45..1.67） | 上申で人と時間が実際に増えるようになったぶん、上申なしでは届かない量にする |
| `DIFFICULTY_CAP` | 1.7 | 1.7 | 変えない（上位 1 割ほどが上限で丸められる） |
| 難しさラベル | 1.3 / 1.5 | **1.52 / 1.63** | 新しい分布でほぼ 3 等分（easy / normal / hard） |
| slack | ratio > 1.35 なら ≥ 250 | 同じ（結果として常に 250..400） | — |
| `INCIDENT_BASE` | 70 | **60** | 品質が低くても、障害は「よくある」程度にとどめる |
| `INCIDENT_DIV`（新規） | 100（式の中の固定値） | **150** | `pIncident = clamp((60 − finalQuality) / 150 × opsMult, 0.03, 0.8)`。放置で障害 46% → 26%。罰ではなく「品質が低いと起きやすい」と感じる程度に |
| `HIRE_RAMP_TURNS`（新規） | 1 | **2** | 増員はすぐには速くならない |
| `HIRE_ONBOARD_AP`（新規） | 0 | **1** | 受け入れにはリーダーの時間がかかる |
| `ESC_STAFF_MOD`（新規） | 予算しだいで 0 / −15 / −50 | **−5** | 予算の見通しによる判定をやめた代わり |
| `STAFF_FUND_RATE`（新規） | — | **140 / 110 / 80** | 増員の費用として足す、相場の上限 |
| `EXTEND_OPS`（新規） | — | **−3** | 延長の代償（運用） |
| `BUDGET_CUT_RATE` / `BUDGET_CUT_FREE_SHARE` / `BUDGET_CUT_MIN_FREE`（新規） | 0.15 /（なし）/（なし） | **0.15 / 0.5 / 100** | 予算の見直しは使っていない分から |
| `RATE_UP` / 単価アップの条件（新規） | 15 / なし | **15 / `freeBudget ≥ 15 × 残りターン`** | 払えない値上げの話は来ない |
| `HIRE_COMFORT_RATE` / `HIRE_MIN_RATE` | 100 / 65 | **削除** | 増員は費用ごと承認されるため |

前回の調整（`WASTE_BIAS` .08/.18/.30、`REVIEW_WASTE_MULT` 0.8、`REVIEW_REVEAL_FRAC` 0.5、`GAP_LOG_THRESHOLD` 6、`BEHIND_ONTRACK` 0.02、`BURNOUT_FATIGUE` 65、`quiet` エンディング、終盤イベントの追加、`bigBug` の重み）は**そのまま残す**。

#### 11.3.6 UI の小さな直し

- 「外注会社と話す」ボタンの説明は `外注さんの会社との信頼↑` だけにする。派遣／業務委託の長い注記はボタンに出さない（用語マークアップ `{gaichu}` をボタン文から外す）。注記は用語集（`gaichu`）と、外注交渉モーダルの1行注記だけに置く。

#### 11.3.7 シミュレーションの遊び方（`sim/strategies.ts`）

共通の部品: `restAware`（疲労 ≥ 60 なら休む。休み中は疲労 > 30 のあいだ休みを続ける。それ以外はふつう）、`fillHandsOn`（残りの AP で手を動かす）、`firstEnabled`（選べる選択肢のうち、並べた順で最初のもの）。

- **careless（雑）・passive（放置）・mixed（そこそこ）**: 変えない。
- **firstTimer（はじめての人。ふつうに気をつけるが、コツは知らない）** — 新規。人間の初回プレイの代わり:
  - 働き方: `restAware`。
  - 行動（この順に、AP があるだけ）: ① ターン3以降、前回のレビューから 2 ターン以上たっていればレビュー（隔ターン） ② 前のターンに運用と話していなければ運用と話す（`turnsSinceOpsSync ≥ 1`、隔ターン） ③ 士気がいちばん低い人が 50 未満ならその人と 1on1 ④ 残りは手を動かす。根回し・育成・外注会社と話す はしない。
  - キックオフ: 「厳しいかもしれません。人か予算を相談させてください」→ `addStaff`。外注交渉: 値下げ相談はせず、中堅（候補の2番目）を採用。
  - ステコミ: 遅れていれば「リカバリ案をつけて報告」（選べないときは「正直に報告」）。順調なら「順調です」。
  - 上申モーダル（選べる種類のうち）: ターン ≤ 2 なら `addStaff`。まだ計画変更していない（`!replanned`）なら `extendSchedule`。遅れ > 0.05 なら `cutScope`。それ以外は選べる最初の種類。ターン画面からの上申（`turnEscalation`）はしない。
  - イベント: 追加要望は「次の改善で入れませんか」（2番目）、ほかはすべて最初の選択肢（休ませる・話を聞く・受け入れる・正直に伝える など）。
  - リリース判定: 自動ならそのまま。延期を相談できて残り > 10% なら延期。それ以外は「一部あとまわし」。
- **firstTimerNoEscalation**: firstTimer と同じ行動。キックオフは「この体制でいけます」、遅れは「正直に報告」、上申モーダルはすべて見送り、リリースは自動か「一部あとまわし」。
- **firstTimerHireOnly**: firstTimer と同じ。ただしステコミは キックオフの相談 → 正直に報告 → 順調です の順（キックオフの増員だけ）、リリースは自動か「一部あとまわし」。増員それだけの価値を測る。
- **balanced（バランス）** — 改訂:
  - 行動: これまでどおり（`restAware`、ステコミのターンは根回し、`turnsSinceOpsSync ≥ 1` かターン ≤ 4 なら運用と話す、ターン5以降は毎ターンレビュー、外注がいて 3 ターン話していなければ外注会社と話す、ターン ≤ 6 は育成、チーム行動がなければ士気のいちばん低い人と 1on1、残りは手を動かす）。
  - キックオフ: 「人か予算を相談」。ステコミ: 遅れ > 0.05 なら リカバリ案 → 正直に。順調なら「気になる点も共有」→「順調です」。
  - 上申の選び方 `pickEscalation(s, types)`（`rest = deadline − turn`、`late = behind(s)`、選べる種類だけ）: `rest ≥ 6` なら `addStaff`／`late ≥ 0.06` かつ `!replanned` なら `extendSchedule`／`late ≥ 0.12` なら `cutScope`／`rest ≥ 4` かつ `late ≥ 0.06` なら `addStaff`／それ以外は見送り。
  - ターン画面からの上申: 会議のないターン 7〜10 で `late ≥ 0.06` なら、`pickEscalation(s, ["extendSchedule", "cutScope"])`（prepared）。
  - 外注交渉: 外注の信頼 ≥ 50 なら値下げ相談、中堅を採用。
  - イベント・リリース判定: これまでどおり（追加要望は遅れ > 0.05 かターン ≥ 7 なら「次の改善で」（2番目）、それ以外は受ける、値上げは交渉、前倒しは根拠で断る、bigBug はターン ≥ deadline−1 なら2番目、リリースは 自動 → 残り > 8% なら延期 → 運用の信頼 ≥ 60 なら一部あとまわし → このまま）。
- **balancedNoEscalation**: balanced の行動から根回しを抜く（空いた AP は手を動かす）。キックオフは「この体制でいけます」、遅れは「正直に報告」、順調なら balanced と同じ。上申しない。リリース判定は 自動 → 運用の信頼 ≥ 60 なら一部あとまわし → このまま。
- **reviewEveryTurnNoEscalation**: balancedNoEscalation で、行動だけ「ターン3以降は毎ターンレビュー、`turnsSinceOpsSync ≥ 1` かターン ≤ 4 なら運用と話す、残りは手を動かす」。

#### 11.3.8 測った結果（上の値をすべて入れた試作で 300 シード。シード 301–600 でも各 ±6 ポイント以内）

| 遊び方 | `bundled` | 良い結末（bundled・thanked・smallStart・grew） | 中立（managed・quiet） | はっきり悪い（canceled・incident・burnout） | 平均 最終品質 | 予算切れ | お金 △以下 | ずれが見つかった | 上申の結果が出た |
|---|---|---|---|---|---|---|---|---|---|
| 雑 | 0% | 0% | 1% | 99% | 0 | 0% | 0% | 0% | 0% |
| 放置 | 0% | 0% | 66% | 34% | 19 | 0% | 0% | 0% | 0% |
| そこそこ | 0% | 0% | 90% | 10% | 41 | 0% | 0% | 92% | 0% |
| はじめて（firstTimer） | **30%** | 59% | 37% | 4% | 69 | 0% | 29% | 96% | 100% |
| はじめて・上申なし | 2% | 59% | 38% | 3% | 66 | 0% | 0% | 93% | 0% |
| はじめて・増員だけ | 17% | 58% | 40% | 2% | 66 | 0% | 0% | 96% | 100% |
| （参考）はじめて・延長だけ | 26% | 77% | 19% | 4% | 70 | 0% | 41% | 93% | 98% |
| バランス | **68%** | 97% | 0% | 3% | 83 | 0% | 26% | 74% | 100% |
| バランス・根回し上申なし | 35% | 96% | 0% | 4% | 78 | 0% | 0% | 56% | 0% |
| 毎ターンレビュー・上申なし | 17% | 95% | 0% | 5% | 77 | 0% | 0% | 38% | 0% |

（前回の値では: はじめて 9%、バランス 54%、バランス・上申なし 72%、放置の障害 46%、はじめての予算切れ 50%。）

読み取り:
- 上申は、ゲーム自身の結末で効く。はじめての人で 2% → 30%、バランスで 35% → 68%。増員だけでも 2% → 17%（増員が損だった問題は解消）。範囲の削減だけでは `bundled` は増えない（3%）が、`smallStart` に行く。
- いちばん効く上申は延長（計画変更）。その代わり、外注がいるゲームでは延長分が予定外の出費になり、お金の評価が落ちうる。「時間を買うとお金がかかる」。
- 上申しないはじめての人の結末は、ほとんどが `smallStart`（小さく出す）と `managed`（なんとかリリース）。罰ではなく「もっとできたかも」で終わる。
- 放置は 2/3 が中立の結末。雑はほぼ必ず崩れる（障害か燃え尽き）。
- 難しさの3段（easy / normal / hard）での `bundled`: はじめて 44% / 24% / 21%、バランス 75% / 68% / 60%。

#### 11.3.9 `balance.test.ts` で必ず確かめること（各 300 シード、seed 1..300）

結末は `outcome.endingId` だけで数える。「はっきり悪い」= `canceled` `incident` `burnout`、「中立」= `managed` `quiet`。

1. 雑: `bundled` < 3%、はっきり悪い ≥ 90%。
2. 放置: `bundled` < 5%、はっきり悪い ≤ 45%、中立 ≥ 50%。
3. そこそこ: `bundled` < 10%。
4. はじめて: `bundled` が 22%〜38%。
5. はじめて − はじめて・上申なし ≥ 15 ポイント。はじめて・増員だけ − はじめて・上申なし ≥ 8 ポイント（増員それだけで得）。
6. バランス: `bundled` が 60%〜75%。バランス・上申なし ≤ 45%、かつ バランス − バランス・上申なし ≥ 20 ポイント。
7. 毎ターンレビュー・上申なし: `bundled` ≤ 25%、かつ バランスより 30 ポイント以上低い。
8. はじめて・バランスとも: 予算切れ ≤ 5%。
9. はじめて・バランスとも: 「レビューでずれが見つかった」（`gapRevealed`）≥ 30%、「上申の結果が出た」（`escalation_*`）≥ 30%。
10. すべての戦略・シードで例外なく終わり、終了ターン ≤ 14。同じ seed と戦略なら同じ Outcome。

単体テスト（12.2 に追加）:
- 増員の採用で `budget` と `approvedBudget` が `STAFF_FUND_RATE[archetype] × 払うターン数` だけ増え、`rampTurns = 2`、次のターンの AP が 1 減る。条件付きなら払うターン数は `min(3, 残り)`。
- 予算が少なくても、増員の上申が予算を理由に却下・「期間限定」にならない。
- リリース判定より前の延長承認で `committedDeadline` が動き、`replanned = true`、ops −3、延長分の外注費が `budget` に入り `approvedBudget` には入らない。リリース判定からの延期では `committedDeadline` は動かない。
- `replanned` のゲームで、締切どおりのリリースでも納期は ○（◎ にならない）。
- お金の評価が `spent / approvedBudget` で計算される。
- 予算の見直しの削減額が `min(15% × initialBudget, 50% × freeBudget)` で、`approvedBudget` からも引かれる。`freeBudget < 100` では出ない。単価アップは `freeBudget < 15 × 残りターン` では出ない。
- `pIncident` が新しい式になっている（例: 最終品質 30・opsImpact 2 → 0.2）。

#### 11.3.10 オーナーが決めること

- **延長が強い。** 延長だけで 2% → 26%。代償は「納期は最高 ○」「運用 −3」「延長分の外注費は予定外」。もっと増員を主役にしたいなら、延長の承認を ±1 ターンにする（条件付きのみ）などで弱められる。
- **予算切れがほぼ起きない。** 不意打ちをなくした結果、「予算を使い切ると契約が止まる」体験はなくなった（処理は残っている）。お金の学びは「お金 △（予定外の出費）」の表示が担う。体験として残したいなら、単価アップの条件を外す（払えない値上げを受けると予算切れになりうる）。
- **予算の追加（addBudget）の出番が少ない。** 増員が費用ごと承認され、予算切れも起きないため。使い道を残すなら「承認された追加予算は `approvedBudget` にも入れる」（延長の予定外出費を、お金の相談で埋められる）に変える案がある。
- **上申しないと、上手な人でも `bundled` は 1/3 前後。** 「助けを求めることが仕事のうち」という狙いどおりだが、上申を知らない初回は `bundled` がほぼ出ない（中立の結末で終わる）。振り返り画面で「上申してみよう」を必ず案内すること。

---

## 12. ファイル構成とテスト

### 12.1 ファイル構成（提案）

```
src/
  main.ts                 起動。controller を作ってタイトル画面を出す
  style.css               既存
  game/                   ← DOM に触れない純粋なロジック（すべて Vitest で試せる）
    random.ts             既存 + chance(rng,p) と weightedPick(rng, items: {item, weight}[]) を追加
    types.ts              2章の型
    balance.ts            すべての数値定数（この仕様の数字はここに集める）
    derived.ts            2.1 の派生値
    setup.ts              3章 createInitialState(seed) / validateSetup
    phases.ts             phaseOf, isMeetingTurn, plannedFrac, phaseSkill
    members.ts            memberOutput, applyModeEffects, createMember
    actions.ts            apMax, canAddAction, addAction, removeAction, setMode
    turn.ts               resolveTurn（5.1 の順）, nextTurn
    escalation.ts         approvalScore（理由リストつき）, resolveEscalation, applyEscalation
    vendor.ts             makeCandidates, negotiateRate, hireCandidate
    meetings.ts           meetingOptions(state), applyMeetingChoice
    events.ts             EVENT_DEFS, rollEvent, applyEventChoice
    release.ts            releaseOptions, applyRelease, evaluate, pickEnding
    review.ts             buildTimeline, buildChartSeries
    sim/strategies.ts     テスト用の自動プレイ（careless / passive / mixed / balanced）
  text/
    glossary.ts  notes.ts  endings.ts  events.ts（イベントの文）  render.ts（renderText）
  ui/
    controller.ts         状態の保持、dispatch、乱数、再描画
    assets.ts             絵の差し替え表
    screens/title.ts setup.ts turn.ts result.ts review.ts
    components/modal.ts memberCard.ts meter.ts chart.ts
```

ゲーム関数はすべて `(state, ..., rng?) => GameState` の形で、受け取った state を書き換えない（先頭で `structuredClone`）。

### 12.2 必ず用意する単体テスト

**setup.test.ts**
- 同じ seed → 同じ初期状態（深い比較）。違う seed → 違う初期状態（数シードで）。
- 1,000 シードで: 人数・外注数・スキル範囲・各値の範囲が 3章どおり。validateSetup の4条件がすべて成り立つ。difficulty ≤ 1.5。1人目が veteran。

**phases.test.ts**
- deadline 12 / 11 / 14 で phaseOf がすべてのターンで 1.1 の表どおり。ステコミは 2・6・9。plannedFrac(4)=0、plannedFrac(deadline)=1。

**members.test.ts**
- memberOutput の具体値（例: build 3, normal, 士気60, 疲労10, 負債0 → 4.0）。疲労 50/80 の境目、負債の下限 0.6、ramp・育成の 0.5。
- 各 Mode の士気・疲労の増減と 0..100 のクランプ。

**actions.test.ts**
- apMax（基本4、ステコミ −1、サポート最大+2、ペナルティ、最低1）。
- AP 超過・上限回数・休み中の対象・育成の回数上限で追加が拒否される。取り消しで AP が戻る。

**turn.test.ts**
- 5.1 の順序: 育成が出力より先、レビューの公開が申告ずれ発生より後。
- 要件フェーズの出力は clarity に入り doneWork は増えない（clarity<100 のとき）。
- 申告ずれ: careful だけのチームは optimistic だけのチームより hiddenGap が小さい。レビューありで hiddenGap が減る。teamActed なしで ×1.25 と士気−3。
- テストフェーズで hiddenGap が毎ターン 40% 公開される。
- 運用3ターン放置で ops −4、外注4ターン放置で vendor −3。
- 予算が尽きたら外注が全員抜ける。
- `reportedDone = doneWork + hiddenGap` と `doneWork ≤ totalWork` がいつも成り立つ（ランダムな行動で100ターン分のプロパティテスト）。

**escalation.test.ts**
- approvalScore の各項目（根回し、prepared、時期、締切の固さ、裏付け ±10、回数ペナルティ、ごまかしペナルティ、再見積もりの約束）。
- roll のしきい値 70/50 で3つの結果に分かれる。各 type の承認・条件付きの効果（cutScope が reportedDone を下回らない、deadline 上限14）。

**vendor.test.ts**
- 条件付きのときは若手・中堅だけ。値下げ相談の成功・失敗の効果。採用したメンバの ramp と契約終了ターン。

**meetings.test.ts**
- behind に応じて選択肢が切り替わる（0.02 の境目）。リカバリ案の有効条件。ごまかし→次の会議で behind ≥0.10 なら −12×glossDebt。根回しで減少が半分。steering ≤10 で中止。

**events.test.ts**
- 各イベントの条件（ターン範囲、外注の有無、一度きり、回数上限、直前と同じものは出ない）。
- 優先イベントの確率式。全イベントの各選択肢の効果（表どおりの数値）。
- 同じ seed と同じ状態 → 同じイベント。

**release.test.ts**
- hiddenGap の全公開、自動リリースの境目（2%）、あとまわし・そのまま・延期の効果。
- finalQuality と pIncident の式（下限0.03・上限0.8）。
- 6観点の境目の値と、エンディングの優先順位（例: 障害があれば他の条件を満たしても `incident`）。

**review.test.ts**
- important なログだけが年表に出て、kind ごとのメモが付く（2回目以降は省略）。
- renderText が解説を1画面1回だけ付け、seenTerms に追加する。

**balance.test.ts**（sim/strategies.ts を使い、各200シード）
- careless の良い結末率 < 10%、balanced の良い結末率 > 60%、balanced の平均未完成率 < 10%。
- どのシードでもゲームが例外なく終わる（終了ターン ≤ 14、status が finished）。
- ゲーム全体の決定性: 同じ seed と同じ戦略 → 同じ Outcome。

---

## 13. MVP でやらないこと

セーブ、PM・ベンダ・他チームを独立した関係者として扱うこと、本番の絵、効果音、スマホ最適化、複数チーム。
