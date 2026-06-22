import React from "react";
import ReactDOM from "react-dom/client";
import { Agentation } from "agentation";
import { App } from "./App";
import "./styles.css";

const agentationEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AGENTATION_ENABLED === "true";
const agentationEndpoint =
  import.meta.env.VITE_AGENTATION_ENDPOINT ?? "http://127.0.0.1:4747";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {agentationEnabled && <Agentation endpoint={agentationEndpoint} />}
  </React.StrictMode>
);
