/**
 * Küçük IndexedDB sarmalayıcısı (bağımlılıksız). Kayıtlar iki depoda tutulur:
 * - saveMeta: listeleme için hafif bilgiler
 * - saveData: tam oyun durumu
 */
const DB_NAME = 'age-of-conquerors';
const DB_VERSION = 1;

export const META_STORE = 'saveMeta';
export const DATA_STORE = 'saveData';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcı IndexedDB desteklemiyor'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Veritabanı açılamadı'));
    };
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede kullanılıyor'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Veritabanı işlemi başarısız'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('İşlem başarısız'));
    tx.onabort = () => reject(tx.error ?? new Error('İşlem iptal edildi'));
  });
}

export async function idbPutPair(meta: { id: string }, data: { id: string }): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  tx.objectStore(META_STORE).put(meta);
  tx.objectStore(DATA_STORE).put(data);
  await txDone(tx);
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function idbGet<T>(store: string, id: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(id) as IDBRequest<T | undefined>);
}

export async function idbDeletePair(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  tx.objectStore(META_STORE).delete(id);
  tx.objectStore(DATA_STORE).delete(id);
  await txDone(tx);
}
