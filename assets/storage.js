/**
 * storage.js — ที่เก็บข้อมูลในเครื่องด้วย IndexedDB
 *
 * ใช้เป็น "แคชและคิว" เท่านั้น ไม่ใช่ที่เก็บถาวร
 * แหล่งข้อมูลจริงของประวัติคือ Google Sheets (ดู sheets.js)
 * ถ้าเบราว์เซอร์ถูกล้าง ข้อมูลในชีตยังอยู่ครบ
 *
 * object store:
 *   prefs    — ค่าตั้งค่าเล็ก ๆ ของผู้ใช้ เช่น ชื่อ ภาษา ตัวเลือกล่าสุด และชุดที่ทำค้างไว้
 *   attempts — สำเนาผลการทำข้อสอบไว้ดูตอนออฟไลน์
 *   queue    — ผลที่ยังส่งขึ้นชีตไม่สำเร็จ รอส่งใหม่
 */
(function () {
  const DB_NAME = (window.APP_CONFIG && window.APP_CONFIG.storageNamespace) || 'quiz-bank';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('attempts')) {
          const s = db.createObjectStore('attempts', { keyPath: 'attemptId' });
          s.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'attemptId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  /** อ่านทุกเรคอร์ดใน store (ชุดข้อมูลของผู้ใช้คนเดียวมีขนาดเล็ก จึงอ่านทั้งหมดได้) */
  function all(store) {
    return tx(store, 'readonly', (s) => s.getAll()).catch(() => []);
  }

  const Storage = {
    /* ---------- prefs ---------- */
    async getPref(key, fallback) {
      try {
        const row = await tx('prefs', 'readonly', (s) => s.get(key));
        return row === undefined || row === null ? fallback : row.v;
      } catch {
        return fallback;
      }
    },

    async setPref(key, value) {
      try {
        await tx('prefs', 'readwrite', (s) => s.put({ k: key, v: value }));
      } catch {
        /* เขียนไม่ได้ก็ไม่เป็นไร แค่จำค่าไม่ได้ */
      }
    },

    async delPref(key) {
      try {
        await tx('prefs', 'readwrite', (s) => s.delete(key));
      } catch {
        /* ignore */
      }
    },

    /* ---------- attempts (แคชสำหรับดูออฟไลน์) ---------- */
    async saveAttempt(attempt) {
      try {
        await tx('attempts', 'readwrite', (s) => s.put(attempt));
      } catch {
        /* ignore */
      }
    },

    async getAttempt(attemptId) {
      try {
        return await tx('attempts', 'readonly', (s) => s.get(attemptId));
      } catch {
        return undefined;
      }
    },

    async listAttempts(name) {
      const rows = await all('attempts');
      const filtered = name ? rows.filter((r) => r.name === name) : rows;
      return filtered.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    },

    /* ---------- queue (รอซิงค์ขึ้นชีต) ---------- */
    async enqueue(attempt) {
      try {
        await tx('queue', 'readwrite', (s) => s.put(attempt));
      } catch {
        /* ignore */
      }
    },

    async dequeue(attemptId) {
      try {
        await tx('queue', 'readwrite', (s) => s.delete(attemptId));
      } catch {
        /* ignore */
      }
    },

    listQueue() {
      return all('queue');
    },

    async queueSize() {
      const rows = await all('queue');
      return rows.length;
    },

    /* ---------- ชุดที่ทำค้างไว้ ---------- */
    saveResume(state) {
      return Storage.setPref('resume', state);
    },

    loadResume() {
      return Storage.getPref('resume', null);
    },

    clearResume() {
      return Storage.delPref('resume');
    }
  };

  window.Storage = Storage;
})();
