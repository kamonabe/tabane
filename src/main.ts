import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app が見つかりません");

// 仮のタイトル画面。ゲーム本体はステップ3で作る。
app.innerHTML = `
  <main class="title">
    <h1>tabane</h1>
    <p>チームを束ねて、プロジェクトをリリースまで導こう</p>
    <button class="button" type="button" disabled>はじめる（準備中）</button>
  </main>
`;
