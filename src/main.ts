import "./style.css";
import { createController } from "./ui/controller";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app が見つかりません");

createController(app).start();
