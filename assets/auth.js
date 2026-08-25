/**
 * auth.js — ประตูรหัสเข้าใช้งาน
 *
 * ส่วนอื่นของแอปเรียกใช้แค่ Auth.unlock(code) แล้วได้ { ok, name, key } กลับไป
 * ภายในจะเลือกวิธีตรวจตาม APP_CONFIG.authLevel เอง:
 *
 *   ระดับ 1 — เทียบ PBKDF2 hash กับ data/codes.json ในเบราว์เซอร์
 *             กันคนที่บังเอิญเจอลิงก์ ไม่ได้กันคนที่ตั้งใจ เพราะไฟล์โจทย์ยังโหลดตรงได้
 *
 *   ระดับ 3 — ส่งรหัสไปตรวจที่ Apps Script แล้วรับกุญแจถอดรหัสกลับมา
 *             เพิกถอนรหัสได้จริง และไฟล์โจทย์ใน repo เป็นข้อมูลที่เข้ารหัสไว้
 *
 * การอัปเกรดจากระดับ 1 เป็น 3 ทำได้โดยแก้ config.js เท่านั้น ไม่ต้องแตะไฟล์อื่น
 */
(function () {
  const CFG = window.APP_CONFIG;
  const NS = CFG.storageNamespace || 'quiz-bank';
  const SESSION_KEY = NS + ':session';

  let session = null;

  /** ทำให้รหัสเป็นรูปแบบมาตรฐานก่อนแฮช — ต้องตรงกับ normalizeCode() ใน tools/make-codes.mjs */
  function normalizeCode(raw) {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
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

  /** crypto.subtle มีเฉพาะใน secure context (https หรือ localhost) */
  function cryptoAvailable() {
    return !!(window.crypto && window.crypto.subtle);
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

  /* ---------------- ระดับ 1 : ตรวจในเบราว์เซอร์ ---------------- */

  let codesCache = null;

  async function loadCodes() {
    if (codesCache) return codesCache;
    const res = await fetch('data/codes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('ไม่พบไฟล์ data/codes.json');
    codesCache = await res.json();
    return codesCache;
  }

  async function unlockLocal(rawCode) {
    if (!cryptoAvailable()) return { ok: false, reason: 'insecure' };

    const code = normalizeCode(rawCode);
    if (!code) return { ok: false, reason: 'wrong' };

    const db = await loadCodes();
    const hash = await pbkdf2Hex(code, db.salt, db.iterations || 150000);
    const match = (db.codes || []).find((c) => c.h === hash);

    if (!match) return { ok: false, reason: 'wrong' };
    if (match.active === false) return { ok: false, reason: 'disabled' };
    if (isExpired(match.expires)) return { ok: false, reason: 'expired' };

    // หมายเหตุ: maxUses บังคับใช้ไม่ได้ในระดับ 1 เพราะไม่มีฝั่งเซิร์ฟเวอร์นับจำนวนครั้ง
    // จะมีผลจริงเมื่ออัปเกรดเป็นระดับ 3
    return { ok: true, name: match.name || '', key: null, label: match.label || '' };
  }

  /* ---------------- ระดับ 3 : ให้ Apps Script ตรวจและแจกกุญแจ ---------------- */

  async function unlockRemote(rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) return { ok: false, reason: 'wrong' };
    if (!CFG.sheetsUrl) return { ok: false, reason: 'notconfigured' };

    // ใช้ text/plain เพื่อให้เป็น simple request จะได้ไม่ต้องทำ CORS preflight
    // (Apps Script ตอบ preflight OPTIONS ไม่ได้)
    const res = await fetch(CFG.sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'unlock', code, key: CFG.sheetsKey || '' })
    });
    if (!res.ok) throw new Error('unlock request failed: ' + res.status);

    const data = await res.json();
    if (!data.ok) return { ok: false, reason: data.reason || 'wrong' };
    return { ok: true, name: data.name || '', key: data.key || null, label: data.label || '' };
  }

  /* ---------------- ส่วนที่แอปเรียกใช้ ---------------- */

  function persist(sess, remember) {
    session = sess;
    const store = remember ? window.localStorage : window.sessionStorage;
    try {
      store.setItem(SESSION_KEY, JSON.stringify(sess));
    } catch {
      /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ใช้งานต่อได้ในหน่วยความจำ */
    }
  }

  const Auth = {
    normalizeCode,

    /** ปิดประตูไว้หรือไม่ */
    get required() {
      return CFG.authRequired !== false;
    },

    get session() {
      return session;
    },

    /** true เมื่อผ่านประตูแล้ว */
    get unlocked() {
      return !Auth.required || !!session;
    },

    /** กุญแจถอดรหัสไฟล์โจทย์ (มีเฉพาะระดับ 3) */
    get key() {
      return session ? session.key : null;
    },

    /** ชื่อที่ผูกมากับรหัส — ถ้าว่างแปลว่าเป็นรหัสกลาง ให้ผู้ใช้พิมพ์ชื่อเอง */
    get lockedName() {
      return session && session.name ? session.name : '';
    },

    /** คืนค่า session ที่เคยบันทึกไว้ ถ้ามี */
    restore() {
      if (!Auth.required) return null;
      for (const store of [window.sessionStorage, window.localStorage]) {
        try {
          const raw = store.getItem(SESSION_KEY);
          if (!raw) continue;
          const sess = JSON.parse(raw);
          if (sess && typeof sess === 'object') {
            session = sess;
            return sess;
          }
        } catch {
          /* ข้ามไป */
        }
      }
      return null;
    },

    /**
     * ตรวจรหัสและเปิดใช้งาน
     * @returns {Promise<{ok:boolean, name?:string, reason?:string}>}
     */
    async unlock(rawCode, remember) {
      if (!Auth.required) {
        persist({ name: '', key: null, label: '', at: new Date().toISOString() }, false);
        return { ok: true, name: '' };
      }

      const level = Number(CFG.authLevel) === 3 ? 3 : 1;
      const result = level === 3 ? await unlockRemote(rawCode) : await unlockLocal(rawCode);

      if (result.ok) {
        persist(
          { name: result.name || '', key: result.key || null, label: result.label || '', at: new Date().toISOString() },
          !!remember
        );
      }
      return result;
    },

    signOut() {
      session = null;
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  window.Auth = Auth;
})();
