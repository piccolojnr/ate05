import { StrictMode } from "react";
import { Toaster } from "@ate05/ui";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./app";
import { TooltipProvider } from "./components/ui/tooltip";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);
