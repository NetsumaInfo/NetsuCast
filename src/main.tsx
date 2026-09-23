import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "./i18n";
import App from "./App";
import "./index.css";
import { savedTheme } from "./lib/theme";

document.documentElement.dataset.theme = savedTheme();

initI18n().then(() =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
