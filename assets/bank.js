/**
 * bank.js — โหลดคลังข้อสอบจากโฟลเดอร์ data/
 *
 * รองรับสองรูปแบบไฟล์ผ่านอินเทอร์เฟซเดียวกัน:
 *   APP_CONFIG.encrypted = false → ไฟล์ JSON ธรรมดา
 *   APP_CONFIG.encrypted = true  → ไฟล์ที่เข้ารหัส AES-GCM ถอดด้วยกุญแจจาก Auth.key
 *
 * วันที่อัปเกรดเป็นระดับ 3 จึงแก้แค่ config.js ส่วนโค้ดที่เหลือไม่ต้องแตะ
 */
(function () {
  const CFG = window.APP_CONFIG;

  let state = null; // { manifest, domains, byId, version }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** ถอดรหัสไฟล์ที่อยู่ในรูป { enc, iv, ct } ด้วยกุญแจ base64 */
  async function decrypt(payload, keyB64) {
    if (!keyB64) throw new Error('ไม่มีกุญแจถอดรหัส — ต้องปลดล็อกด้วยรหัสก่อน');
    if (!window.crypto || !crypto.subtle) {
      throw new Error('เบราว์เซอร์นี้ถอดรหัสไม่ได้ ต้องเปิดผ่าน https:// หรือ http://localhost');
    }
    const key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(payload.iv) },
      key,
      b64ToBytes(payload.ct)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function fetchJson(path, version) {
    const url = version ? `${path}?v=${encodeURIComponent(version)}` : path;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`โหลด ${path} ไม่สำเร็จ (HTTP ${res.status})`);
    return res.json();
  }

  /** จัดรูปคำถามให้อยู่ในรูปแบบเดียวกันเสมอ และเติมค่าที่ขาดให้ปลอดภัย */
  function normalizeQuestion(raw, domainId, index) {
    const choices = (raw.choices || [])
      .filter((c) => c && (String(c.en || '').trim() || String(c.th || '').trim()))
      .map((c, i) => ({
        k: String(c.k || String.fromCharCode(65 + i)).toUpperCase(),
        en: c.en || '',
        th: c.th || ''
      }));

    const valid = new Set(choices.map((c) => c.k));
    const answer = (Array.isArray(raw.answer) ? raw.answer : [raw.answer])
      .filter(Boolean)
      .map((k) => String(k).toUpperCase())
      .filter((k) => valid.has(k));

    return {
      id: String(raw.id || `d${domainId}-auto-${index}`),
      domain: domainId,
      type: raw.type === 'multi' || answer.length > 1 ? 'multi' : 'single',
      q: raw.q || { en: '', th: '' },
      choices,
      answer,
      explain: raw.explain || { en: '', th: '' },
      // เพิ่มเติม — บันทึกศึกษาเชิงลึกเสริมจากคำอธิบายหลัก ไม่บังคับ มักเป็นเนื้อหาเดียวกันทั้งสองภาษา
      insight: raw.insight || { en: '', th: '' },
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      ref: raw.ref || ''
    };
  }

  const Bank = {
    /** โหลด manifest + โดเมนทั้งหมด + คำถามทั้งหมด (เรียกครั้งเดียวหลังผ่านประตูรหัส) */
    async load() {
      if (state) return state;

      const manifest = await fetchJson('data/manifest.json');
      const version = manifest.version || '';
      const encrypted = manifest.encrypted === true || CFG.encrypted === true;

      const domainList = await fetchJson('data/' + (manifest.domainsFile || 'domains.json'), version);

      const domains = [];
      for (const d of domainList) {
        let file;
        try {
          file = await fetchJson('data/' + d.file, version);
          if (encrypted && file && file.enc) file = await decrypt(file, window.Auth ? window.Auth.key : null);
        } catch (err) {
          console.warn('ข้ามโดเมน', d.id, err);
          file = { questions: [] };
        }

        const questions = (file.questions || [])
          .map((q, i) => normalizeQuestion(q, d.id, i))
          .filter((q) => q.choices.length >= 2 && q.answer.length >= 1);

        const thCount = questions.filter(
          (q) => window.I18N.hasThai(q.q) && q.choices.every((c) => String(c.th || '').trim())
        ).length;

        domains.push({
          id: d.id,
          file: d.file,
          name: d.name,
          questions,
          count: questions.length,
          thCount
        });
      }

      const byId = new Map();
      for (const d of domains) for (const q of d.questions) byId.set(q.id, q);

      state = { manifest, domains, byId, version, encrypted };
      return state;
    },

    get state() {
      return state;
    },

    /** คำถามทั้งหมดของโดเมนที่เลือก เรียงตามลำดับโดเมนและลำดับในไฟล์ */
    pool(domainIds) {
      if (!state) return [];
      const wanted = new Set(domainIds.map(Number));
      const out = [];
      for (const d of state.domains) {
        if (!wanted.has(d.id)) continue;
        out.push(...d.questions);
      }
      return out;
    },

    /** ค้นคำถามจาก id — ใช้ตอนเปิดดูเฉลยของการทำข้อสอบครั้งเก่า */
    byId(id) {
      return state ? state.byId.get(id) : undefined;
    },

    domain(id) {
      return state ? state.domains.find((d) => d.id === Number(id)) : undefined;
    }
  };

  window.Bank = Bank;
})();
