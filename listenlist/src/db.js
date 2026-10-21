// Tiny IndexedDB wrapper. Everything stays on this device.
const DB_NAME = 'listenlist';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('lists')) db.createObjectStore('lists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAllLists = () => run('lists', 'readonly', (s) => s.getAll());
export const putList = (list) => run('lists', 'readwrite', (s) => s.put(list));
export const deleteList = async (id) => {
  await run('lists', 'readwrite', (s) => s.delete(id));
  await run('audio', 'readwrite', (s) => s.delete(id));
};
export const getAudio = (id) => run('audio', 'readonly', (s) => s.get(id));
export const putAudio = (rec) => run('audio', 'readwrite', (s) => s.put(rec));
export const deleteAudio = (id) => run('audio', 'readwrite', (s) => s.delete(id));
