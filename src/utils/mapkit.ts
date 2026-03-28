let initPromise: Promise<void> | null = null;

export function loadMapKit(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve, reject) => {
    const mk = (window as any).mapkit;
    if (mk?.loadedLibraries?.length > 0) {
      resolve();
      return;
    }

    const token = import.meta.env.VITE_APPLE_MAPKIT_TOKEN as string;
    if (!token) {
      reject(new Error('VITE_APPLE_MAPKIT_TOKEN is not set'));
      return;
    }

    (window as any).__orbitMapKitReady = () => {
      delete (window as any).__orbitMapKitReady;
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js';
    script.crossOrigin = '';
    script.async = true;
    script.dataset.callback = '__orbitMapKitReady';
    script.dataset.libraries = 'map,annotations,services';
    script.dataset.token = token;

    script.onerror = () => {
      initPromise = null;
      reject(new Error('Failed to load MapKit JS'));
    };

    document.head.appendChild(script);
  });

  return initPromise;
}

export function getMapKit(): any {
  return (window as any).mapkit;
}
