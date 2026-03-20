import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { supabase } from "./api/supabase";
import { clearOrbitStorage, isLikelyInvalidSession } from "./utils/auth";
import { startWebVitalsBaseline } from "./utils/webVitals";
import { initAnalytics } from "./utils/analytics";

if (import.meta.env.DEV && typeof window !== "undefined" && "serviceWorker" in navigator) {
	navigator.serviceWorker
		.getRegistrations()
		.then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
		.catch(() => undefined);

	if ("caches" in window) {
		caches
			.keys()
			.then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
			.catch(() => undefined);
	}
}

const rootElement = document.getElementById("root");

const renderApp = () => {
	if (!rootElement) {
		throw new Error("Root container #root not found");
	}

	// Remove the static cold-start placeholder immediately to avoid a double-splash
	try {
		const cold = document.getElementById('cold-start');
		if (cold && cold.parentNode) cold.parentNode.removeChild(cold);
	} catch (e) {
		// ignore
	}

	// 🚧 Important: Avoid React.StrictMode here because Supabase's auth client uses
	// the Web Locks API internally. StrictMode's intentional double-mount pattern
	// was causing locks to be "stolen" mid-flight, which surfaced as
	// "AbortError: Lock broken by another request with the 'steal' option" in dev
	// tools. Rendering the app once prevents orphaned locks while keeping the rest
	// of the app unchanged.
	createRoot(rootElement).render(
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	);
};

const bootstrapAuthThenRender = async () => {
	try {
		// 关键：先让 Supabase 从 localStorage 完成会话恢复，再挂载应用
		const { error } = await supabase.auth.getSession();

		if (error && isLikelyInvalidSession(error.message)) {
			try {
				await supabase.auth.signOut({ scope: "local" });
			} catch {
				// ignore
			}
			clearOrbitStorage();
		}
	} catch {
		// 启动阶段不能因为鉴权预热失败而阻断渲染
	} finally {
		initAnalytics();
		renderApp();
	}
};

void bootstrapAuthThenRender();

// 采集首屏性能基线（LCP/CLS/INP）
startWebVitalsBaseline();
