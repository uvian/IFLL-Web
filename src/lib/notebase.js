/*
 * IFLL — Notebase: IndexedDB knowledge base
 * Stores discovered vocabulary with AI analysis for search & review
 */
const IFLL_NOTEBASE = (() => {
  const DB_NAME = 'ifll_notebase';
  const DB_VERSION = 1;
  const STORE = 'notes';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'en' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function setNote(en, zh, def, ipa, examples, aiDeep, aiExamples) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ en, zh, def, ipa, examples, aiDeep, aiExamples, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getNote(en) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(en);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function listNotes(prefix = '', limit = 50) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const notes = [];
      tx.objectStore(STORE).openCursor(null, 'next').onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return resolve({ notes, total: notes.length });
        const n = cursor.value;
        if (!prefix || n.en.startsWith(prefix) || (n.zh && n.zh.includes(prefix))) {
          if (notes.length < limit) notes.push(n);
        }
        cursor.continue();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteNote(en) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(en);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function countNotes() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  return { setNote, getNote, listNotes, deleteNote, countNotes };
})();
