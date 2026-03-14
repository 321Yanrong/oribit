import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

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

// 🚧 Important: Avoid React.StrictMode here because Supabase's auth client uses
// the Web Locks API internally. StrictMode's intentional double-mount pattern
// was causing locks to be "stolen" mid-flight, which surfaced as
// "AbortError: Lock broken by another request with the 'steal' option" in dev
// tools. Rendering the app once prevents orphaned locks while keeping the rest
// of the app unchanged.
createRoot(document.getElementById("root")!).render(<App />);
