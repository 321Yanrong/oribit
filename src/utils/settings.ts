export type OrbitSettings = {
  fontSize: 'small' | 'normal' | 'large';
  darkMode: boolean;
  wifiOnlyUpload: boolean;
  wifiOnlyRefresh: boolean;
  notifyAt: boolean;
  notifyComment: boolean;
  notifyFriendRequest: boolean;
  allowShare: boolean;
};

export const SETTINGS_STORAGE_KEY = 'orbit_settings';
export const SETTINGS_EVENT = 'orbit:settings';
export const DEFAULT_SETTINGS: OrbitSettings = {
  fontSize: 'normal',
  darkMode: true,
  wifiOnlyUpload: false,
  wifiOnlyRefresh: false,
  notifyAt: true,
  notifyComment: true,
  notifyFriendRequest: true,
  allowShare: true,
};

export const readSettings = (): OrbitSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    } as OrbitSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const writeSettings = (next: OrbitSettings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
};

export const isWifiConnection = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as any)?.connection;
  if (!conn) return true;
  if (typeof conn.type === 'string') {
    return conn.type === 'wifi' || conn.type === 'ethernet';
  }
  return true;
};

export const shouldAllowUpload = (): boolean => {
  const settings = readSettings();
  if (!settings.wifiOnlyUpload) return true;
  return isWifiConnection();
};

export const shouldAllowRefresh = (): boolean => {
  const settings = readSettings();
  if (!settings.wifiOnlyRefresh) return true;
  return isWifiConnection();
};
