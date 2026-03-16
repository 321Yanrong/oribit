const DB_NAME = 'orbit-media-cache';
const DB_VERSION = 1;
const STORE = 'pending-photo-queue';

interface PendingPhotoRow {
  id?: number;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('open db failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
};

const runTx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode, { durability: 'relaxed' as any });
    const store = tx.objectStore(STORE);
    const finish = (result: T) => {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('tx error'));
      tx.onabort = () => reject(tx.error || new Error('tx abort'));
    };
    try {
      const maybePromise = fn(store);
      if (maybePromise instanceof Promise) {
        maybePromise.then((res) => finish(res)).catch(reject);
      } else {
        finish(maybePromise as T);
      }
    } catch (err) {
      reject(err);
    }
  });
};

export const savePendingPhotos = async (files: File[], limit = 8): Promise<void> => {
  if (!files.length) return;
  try {
    await runTx('readwrite', (store) => {
      store.clear();
      const slice = files.slice(0, limit);
      slice.forEach((file) => {
        const row: PendingPhotoRow = {
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
          blob: file,
        };
        store.put(row);
      });
      return undefined;
    });
  } catch (err) {
    console.warn('[pendingUploads] save failed', err);
  }
};

export const loadPendingPhotos = async (): Promise<File[]> => {
  try {
    const rows = await runTx<PendingPhotoRow[]>('readonly', (store) => {
      return new Promise<PendingPhotoRow[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as PendingPhotoRow[]);
        req.onerror = () => reject(req.error || new Error('getAll failed'));
      });
    });
    return rows.map((row) => new File([row.blob], row.name || 'pending.jpg', {
      type: row.type || 'image/jpeg',
      lastModified: row.lastModified || Date.now(),
    }));
  } catch (err) {
    console.warn('[pendingUploads] load failed', err);
    return [];
  }
};

export const clearPendingPhotos = async (): Promise<void> => {
  try {
    await runTx('readwrite', (store) => {
      store.clear();
      return undefined;
    });
  } catch (err) {
    console.warn('[pendingUploads] clear failed', err);
  }
};
