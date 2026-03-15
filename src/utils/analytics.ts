import posthog from 'posthog-js';

let inited = false;

export const initAnalytics = () => {
  if (inited) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://app.posthog.com';
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: true,
    persistence: 'localStorage+cookie',
  });
  inited = true;
};

export const track = (event: string, properties?: Record<string, any>) => {
  if (!inited) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // ignore
  }
};
