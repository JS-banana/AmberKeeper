const DB_NAME = 'amberkeeper-provider-icon-cache';
const STORE_NAME = 'icons';
const DB_VERSION = 1;
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedIcon {
  url: string;
  dataUrl: string;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });

  return dbPromise;
}

export async function getCachedIcon(url: string): Promise<string | null> {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedIcon | undefined;
        if (result && Date.now() - result.timestamp < CACHE_EXPIRY_MS) {
          resolve(result.dataUrl);
          return;
        }

        resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheIcon(url: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDB();

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ url, dataUrl, timestamp: Date.now() } as CachedIcon);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  } catch {
    return;
  }
}
