import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import background1 from "./assets/backgrounds/background.png";
import background2 from "./assets/backgrounds/art002e009277~large.jpg";
import background3 from "./assets/backgrounds/art002e009278~large.jpg";
import background4 from "./assets/backgrounds/art002e009285~large.jpg";
import background5 from "./assets/backgrounds/art002e009287~large.jpg";
import background6 from "./assets/backgrounds/art002e009288orig.jpg";
import background7 from "./assets/backgrounds/art002e009299~large.jpg";
import background8 from "./assets/backgrounds/art002e009301~large.jpg";
import { App } from "./App";
import "./styles/shared.module.css";

const BACKGROUNDS: readonly string[] = [
  background1,
  background2,
  background3,
  background4,
  background5,
  background6,
  background7,
  background8,
];

const selectedBackground = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)] ?? background1;
document.documentElement.style.setProperty("--mission-background-image", `url("${selectedBackground}")`);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
