/**
 * sheets.js — ตัวเชื่อมกับ Google Sheets ผ่าน Apps Script Web App
 *
 * ข้อจำกัดของ Apps Script ที่ต้องรู้:
 *   - ตอบ CORS preflight (OPTIONS) ไม่ได้ จึงต้องส่งเป็น simple request เท่านั้น
 *     คือใช้ Content-Type: text/plain แล้วให้ฝั่งสคริปต์ JSON.parse เอง
 *   - /exec จะ redirect ไป script.googleusercontent.com ซึ่ง fetch ตามให้อัตโนมัติ
 *
 * ทุกฟังก์ชันออกแบบให้ "ล้มเหลวแล้วไม่พัง" — ถ้าติดต่อไม่ได้จะคืนค่าที่ใช้ต่อได้เสมอ
 * แล้วให้ชั้นบนไปหยิบข้อมูลจากแคชใน IndexedDB แทน
 */
(function () {
  const CFG = window.APP_CONFIG;
  const TIMEOUT_MS = 15000;

  function configured() {
    return !!(CFG.sheetsUrl && /^https:\/\//i.test(CFG.sheetsUrl));
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  async function post(payload) {
    const res = await withTimeout(
      fetch(CFG.sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, key: CFG.sheetsKey || '' })
      }),
      TIMEOUT_MS
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function get(params) {
    const url = new URL(CFG.sheetsUrl);
    url.searchParams.set('key', CFG.sheetsKey || '');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v == null ? '' : String(v));

    const res = await withTimeout(fetch(url.toString(), { method: 'GET' }), TIMEOUT_MS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const Sheets = {
    configured,

    /** ส่งผลการทำข้อสอบขึ้นชีต — คืน true เมื่อสำเร็จ */
    async submit(attempt) {
      if (!configured()) return false;
      try {
        const data = await post({ action: 'submit', attempt });
        return !!(data && data.ok);
      } catch (err) {
        console.warn('ส่งผลขึ้นชีตไม่สำเร็จ', err);
        return false;
      }
    },

    /**
     * ดึงรายการประวัติ
     * @param {string} name ชื่อผู้ทำ — เว้นว่างเพื่อดึงของทุกคน
     */
    async list(name) {
      if (!configured()) return null;
      try {
        const data = await get({ action: 'list', name: name || '' });
        return data && data.ok ? data.attempts || [] : null;
      } catch (err) {
        console.warn('ดึงประวัติจากชีตไม่สำเร็จ', err);
        return null;
      }
    },

    /** ดึงรายละเอียดรายข้อของการทำข้อสอบครั้งหนึ่ง */
    async detail(attemptId) {
      if (!configured()) return null;
      try {
        const data = await get({ action: 'attempt', id: attemptId });
        return data && data.ok ? data : null;
      } catch (err) {
        console.warn('ดึงรายละเอียดจากชีตไม่สำเร็จ', err);
        return null;
      }
    },

    /** ทดสอบว่าตั้งค่าถูกต้องหรือยัง */
    async ping() {
      if (!configured()) return false;
      try {
        const data = await get({ action: 'ping' });
        return !!(data && data.ok);
      } catch {
        return false;
      }
    },

    /**
     * ส่งรายการที่ค้างอยู่ในคิวขึ้นชีตใหม่
     * @returns {Promise<number>} จำนวนที่ยังค้างอยู่หลังพยายามส่ง
     */
    async flush() {
      if (!configured()) return window.Storage.queueSize();
      const pending = await window.Storage.listQueue();
      for (const attempt of pending) {
        const ok = await Sheets.submit(attempt);
        if (ok) await window.Storage.dequeue(attempt.attemptId);
        else break; // ส่งไม่ผ่านหนึ่งรายการก็หยุด ไม่ต้องรัวซ้ำ
      }
      return window.Storage.queueSize();
    }
  };

  window.Sheets = Sheets;
})();
