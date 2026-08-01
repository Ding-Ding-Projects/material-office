import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Page from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("The static Material Office page root is missing.");

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
