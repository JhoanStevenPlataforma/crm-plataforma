import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { repairedQuotePortalHash } from "./components/atomic-crm/quotes/portal/quotePortalPaths";

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

// A customer's quotation link that a mail provider re-encoded on the way
// (`#/quote%23<token>`) is put right before the router reads the address.
const repairedHash = repairedQuotePortalHash(window.location.hash);
if (repairedHash) {
  window.history.replaceState(null, "", repairedHash);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
