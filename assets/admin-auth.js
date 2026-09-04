/**
 * admin-auth.js — ประตูรหัสสำหรับเครื่องมือฝั่ง admin เท่านั้น
 * (tools/import.html, tools/editor.html)
 *
 * แยกจาก assets/auth.js (ประตูของคนทำข้อสอบ) โดยเจตนา — รหัสทำข้อสอบต้อง
 * ไม่สามารถใช้เปิดเครื่องมือแก้ไข/นำเข้าโจทย์ได้ จึงเก็บรหัสไว้คนละไฟล์
 * (data/admin-codes.json) ตรวจด้วย PBKDF2 hash แบบเดียวกับ auth.js
 *
 * ตั้งใจให้เป็น "ด่านกันคนบังเอิญเจอ URL" ไม่ใช่การป้องกันระดับเซิร์ฟเวอร์ —
 * ด่านที่แท้จริงที่ทำให้โจทย์ปลอมไปโผล่บนเว็บจริงไม่ได้คือสิทธิ์ push เข้า
 * GitHub repo ซึ่งเครื่องมือเหล่านี้ทำได้แค่ "ดาวน์โหลดไฟล์ JSON" เท่านั้น
 *
 * ต่างจาก Auth (คนทำข้อสอบ) ตรงที่ไม่มีตัวเลือก "จำอุปกรณ์นี้ไว้" —
 * session จะหายเมื่อปิดแท็บเสมอ เพราะหน้านี้เห็นเฉลยทั้งคลังพร้อมกัน
 */
(function () {
  const SESSION_KEY = 'admin-tools:session';
  let session = null;

  function normalizeCode(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function bytesToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function pbkdf2Hex(code, saltHex, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return bytesToHex(bits);
  }

  function isExpired(dateStr) {
    if (!dateStr) return false;
    const end = new Date(dateStr + 'T23:59:59');
    if (isNaN(end.getTime())) return false;
    return Date.now() > end.getTime();
  }

  let codesCache = null;

  async function loadCodes() {
    if (codesCache) return codesCache;
    const res = await fetch('../data/admin-codes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('ไม่พบไฟล์ data/admin-codes.json — ยังไม่ได้ตั้งรหัส admin');
    codesCache = await res.json();
    return codesCache;
  }

  const AdminAuth = {
    get unlocked() {
      return !!session;
    },

    restore() {
      try {
        const raw = window.sessionStorage.getItem(SESSION_KEY);
        if (raw) session = JSON.parse(raw);
      } catch {
        /* ข้ามไป */
      }
      return session;
    },

    /** @returns {Promise<{ok:boolean, reason?:string}>} */
    async unlock(rawCode) {
      if (!window.crypto || !crypto.subtle) return { ok: false, reason: 'insecure' };

      const code = normalizeCode(rawCode);
      if (!code) return { ok: false, reason: 'wrong' };

      let db;
      try {
        db = await loadCodes();
      } catch (err) {
        return { ok: false, reason: 'notconfigured' };
      }

      const hash = await pbkdf2Hex(code, db.salt, db.iterations || 150000);
      const match = (db.codes || []).find((c) => c.h === hash);

      if (!match) return { ok: false, reason: 'wrong' };
      if (match.active === false) return { ok: false, reason: 'disabled' };
      if (isExpired(match.expires)) return { ok: false, reason: 'expired' };

      session = { at: new Date().toISOString() };
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        /* ใช้งานต่อได้แม้เขียนไม่ได้ แค่ session หายเร็วขึ้นถ้าโหลดหน้าใหม่ */
      }
      return { ok: true };
    },

    signOut() {
      session = null;
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  window.AdminAuth = AdminAuth;
})();
