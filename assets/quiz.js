/**
 * quiz.js — เครื่องยนต์ของการทำข้อสอบ (ตรรกะล้วน ไม่ยุ่งกับ DOM)
 *
 * ทำหน้าที่: เลือกชุดคำถาม จัดลำดับ บันทึกคำตอบ ตัดสินถูกผิด และสรุปผล
 * การจับเวลาและการวาดหน้าจอเป็นงานของ app.js
 */
(function () {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeAttemptId() {
    const now = new Date();
    const pad = (n, w) => String(n).padStart(w || 2, '0');
    const stamp =
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());
    const rand = Math.random().toString(36).slice(2, 6);
    return `${stamp}-${rand}`;
  }

  /** เทียบคำตอบแบบไม่สนลำดับ ต้องตรงครบทุกตัวจึงนับว่าถูก */
  function isCorrect(picked, answer) {
    if (!picked || picked.length === 0) return false;
    if (picked.length !== answer.length) return false;
    const set = new Set(answer);
    return picked.every((k) => set.has(k));
  }

  const Quiz = {
    shuffle,
    isCorrect,

    /**
     * สร้างชุดข้อสอบใหม่
     * @param {Object} opts
     * @param {Array}  opts.pool           คำถามทั้งหมดที่เลือกได้
     * @param {string} opts.name           ชื่อผู้ทำ
     * @param {string} opts.mode           'practice' | 'exam'
     * @param {string} opts.order          'sequential' | 'random'
     * @param {string} opts.reveal         'instant' | 'end'   (โหมด exam จะถูกบังคับเป็น 'end')
     * @param {number} opts.count          จำนวนข้อที่ต้องการ
     * @param {number[]} opts.domains      โดเมนที่เลือก
     * @param {boolean} opts.shuffleChoices สลับลำดับตัวเลือกด้วยหรือไม่
     */
    create(opts) {
      const reveal = opts.mode === 'exam' ? 'end' : opts.reveal === 'end' ? 'end' : 'instant';
      let picked = opts.order === 'random' ? shuffle(opts.pool) : opts.pool.slice();

      const count = Math.max(1, Math.min(Number(opts.count) || picked.length, picked.length));
      picked = picked.slice(0, count);

      const items = picked.map((q) => {
        const choiceOrder = opts.shuffleChoices ? shuffle(q.choices.map((c) => c.k)) : q.choices.map((c) => c.k);
        return {
          qid: q.id,
          domain: q.domain,
          choiceOrder,
          picked: [],
          ok: null,
          ms: 0,
          flagged: false,
          revealed: false
        };
      });

      return {
        attemptId: makeAttemptId(),
        name: opts.name || '',
        mode: opts.mode,
        order: opts.order,
        reveal,
        // domains = โดเมนที่ปรากฏจริงในชุดนี้ ส่วน selectedDomains = ที่ผู้ใช้ติ๊กไว้ตอนตั้งค่า
        // สองค่านี้ต่างกันได้ เช่น ติ๊กครบ 8 โดเมนแต่เลือกแบบเรียงลำดับเพียง 3 ข้อ
        domains: [...new Set(items.map((i) => i.domain))].sort((a, b) => a - b),
        selectedDomains: (opts.domains || []).slice().sort((a, b) => a - b),
        total: items.length,
        items,
        index: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        bankVersion: opts.bankVersion || ''
      };
    },

    current(session) {
      return session.items[session.index] || null;
    },

    /**
     * บันทึกคำตอบของข้อปัจจุบัน
     * @param {string[]} keys ตัวเลือกที่ผู้ใช้เลือก — ส่ง [] เมื่อหมดเวลาโดยไม่ได้ตอบ
     */
    answer(session, keys, elapsedMs) {
      const item = Quiz.current(session);
      if (!item || item.ok !== null) return item;

      const q = window.Bank.byId(item.qid);
      item.picked = (keys || []).slice();
      item.ok = q ? isCorrect(item.picked, q.answer) : false;
      item.ms = Math.max(0, Math.round(elapsedMs || 0));
      item.revealed = session.reveal === 'instant';
      return item;
    },

    /** ไปข้อถัดไป — คืน false เมื่อไม่มีข้อถัดไปแล้ว */
    next(session) {
      if (session.index >= session.items.length - 1) return false;
      session.index += 1;
      return true;
    },

    /** ปิดชุดข้อสอบ ข้อที่ยังไม่ได้ตอบจะถูกนับว่าไม่ได้ตอบ (และไม่ถูก) */
    finish(session) {
      for (const item of session.items) {
        if (item.ok === null) {
          item.ok = false;
          item.picked = [];
        }
      }
      session.finishedAt = new Date().toISOString();
      return Quiz.score(session);
    },

    /** สรุปคะแนนรวมและแยกรายโดเมน */
    score(session) {
      let correct = 0;
      let wrong = 0;
      let unanswered = 0;
      const byDomain = {};

      for (const item of session.items) {
        const d = (byDomain[item.domain] = byDomain[item.domain] || { c: 0, w: 0, total: 0 });
        d.total += 1;

        if (item.ok === true) {
          correct += 1;
          d.c += 1;
        } else {
          wrong += 1;
          d.w += 1;
          if (!item.picked || item.picked.length === 0) unanswered += 1;
        }
      }

      const answered = session.items.filter((i) => i.ok !== null).length;
      const durationSec = session.items.reduce((sum, i) => sum + (i.ms || 0), 0) / 1000;

      return {
        correct,
        wrong,
        unanswered,
        answered,
        total: session.items.length,
        pct: session.items.length ? Math.round((correct / session.items.length) * 1000) / 10 : 0,
        byDomain,
        durationSec: Math.round(durationSec)
      };
    },

    /** จำนวนข้อที่ตอบถูก/ผิดจนถึงตอนนี้ ใช้แสดงตัวนับระหว่างทำ */
    progress(session) {
      let correct = 0;
      let wrong = 0;
      for (const item of session.items) {
        if (item.ok === true) correct += 1;
        else if (item.ok === false) wrong += 1;
      }
      return { correct, wrong, done: correct + wrong };
    },

    /** แปลง session เป็นเรคอร์ดสำหรับส่งขึ้น Google Sheets และเก็บเป็นประวัติ */
    toAttempt(session) {
      const s = Quiz.score(session);
      return {
        attemptId: session.attemptId,
        name: session.name,
        mode: session.mode,
        order: session.order,
        reveal: session.reveal,
        domains: session.domains,
        selectedDomains: session.selectedDomains || session.domains,
        total: s.total,
        correct: s.correct,
        wrong: s.wrong,
        unanswered: s.unanswered,
        scorePct: s.pct,
        durationSec: s.durationSec,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt || new Date().toISOString(),
        bankVersion: session.bankVersion || '',
        byDomain: s.byDomain,
        items: session.items.map((i, idx) => ({
          seq: idx + 1,
          qid: i.qid,
          domain: i.domain,
          picked: i.picked,
          ok: i.ok === true,
          ms: i.ms,
          flagged: !!i.flagged
        }))
      };
    }
  };

  window.Quiz = Quiz;
})();
