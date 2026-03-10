import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

function installApiFetchFallback() {
  if (typeof window === "undefined") return;

  const marker = "__wasaas_fetch_fallback_installed__";
  if ((window as any)[marker]) return;

  const fromEnv = String((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const localFallback = isLocalHost && window.location.port !== "3001" ? "http://localhost:3001" : "";
  const fallbackOrigin = fromEnv || localFallback;

  if (!fallbackOrigin) return;

  const nativeFetch = window.fetch.bind(window);

  const isApiPath = (pathname: string) => {
    return pathname.startsWith("/api") || pathname.startsWith("/ui");
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input !== "string") {
      return nativeFetch(input as any, init);
    }

    const parsed = new URL(input, window.location.origin);
    const isSameOrigin = parsed.origin === window.location.origin;
    const shouldProxyToFallback =
      isSameOrigin &&
      isApiPath(parsed.pathname) &&
      parsed.origin !== fallbackOrigin;

    if (shouldProxyToFallback) {
      const directUrl = `${fallbackOrigin}${parsed.pathname}${parsed.search}`;
      return nativeFetch(directUrl, init);
    }

    const first = await nativeFetch(input, init);
    if (!isSameOrigin || !isApiPath(parsed.pathname) || first.status !== 404) {
      return first;
    }

    const retryUrl = `${fallbackOrigin}${parsed.pathname}${parsed.search}`;
    return nativeFetch(retryUrl, init);
  };

  (window as any)[marker] = true;
}

installApiFetchFallback();

ReactDOM.createRoot(document.getElementById("root")!).render(
<BrowserRouter>
  <App />
</BrowserRouter>
);
