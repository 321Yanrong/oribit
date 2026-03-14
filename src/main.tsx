import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// 🚧 Important: Avoid React.StrictMode here because Supabase's auth client uses
// the Web Locks API internally. StrictMode's intentional double-mount pattern
// was causing locks to be "stolen" mid-flight, which surfaced as
// "AbortError: Lock broken by another request with the 'steal' option" in dev
// tools. Rendering the app once prevents orphaned locks while keeping the rest
// of the app unchanged.
createRoot(document.getElementById("root")!).render(<App />);
