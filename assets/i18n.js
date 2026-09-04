/**
 * i18n.js — ข้อความของส่วนติดต่อผู้ใช้ (ไม่ใช่เนื้อหาโจทย์)
 *
 * โหมดภาษามี 2 แบบ: 'en' | 'th'
 */
(function () {
  const STRINGS = {
    /* ประตูรหัส */
    gateTitle: { en: 'Access code required', th: 'ต้องใช้รหัสเข้าใช้งาน' },
    gateHint: { en: 'Enter the code you were given to unlock the question bank.', th: 'กรอกรหัสที่ได้รับเพื่อปลดล็อกคลังข้อสอบ' },
    gatePlaceholder: { en: 'e.g. CISSP-2026', th: 'เช่น CISSP-2026' },
    gateSubmit: { en: 'Unlock', th: 'ปลดล็อก' },
    gateRemember: { en: 'Remember this device', th: 'จำอุปกรณ์นี้ไว้' },
    gateWrong: { en: 'That code is not valid.', th: 'รหัสไม่ถูกต้อง' },
    gateExpired: { en: 'That code has expired.', th: 'รหัสนี้หมดอายุแล้ว' },
    gateDisabled: { en: 'That code has been disabled.', th: 'รหัสนี้ถูกปิดการใช้งานแล้ว' },
    gateInsecure: {
      en: 'Access codes need a secure connection. Open this page over https:// or http://localhost.',
      th: 'ระบบรหัสต้องใช้การเชื่อมต่อที่ปลอดภัย กรุณาเปิดหน้านี้ผ่าน https:// หรือ http://localhost'
    },
    signOut: { en: 'Sign out', th: 'ออกจากระบบ' },

    /* หน้า Setup */
    yourName: { en: 'Your name (required)', th: 'ชื่อของคุณ (จำเป็น)' },
    namePlaceholder: { en: 'e.g. Gotji', th: 'เช่น Gotji' },
    studyMode: { en: 'STUDY MODE', th: 'โหมดการเรียน' },
    practice: { en: 'Practice', th: 'ฝึกทำ' },
    practiceHint: { en: 'Instant correct/wrong + explanation', th: 'บอกถูกผิดพร้อมคำอธิบายทันที' },
    exam: { en: 'Exam', th: 'จำลองสอบ' },
    examHint: { en: 'No hints · all answers at the end', th: 'ไม่มีคำใบ้ · เฉลยทั้งหมดตอนจบ' },
    modeNote: {
      en: 'Both modes have a per-question timer and a Finish Now button. Practice shows the correct answer and explanation immediately after each question; Exam holds every answer back until you finish.',
      th: 'ทั้งสองโหมดมีการจับเวลาต่อข้อและปุ่มจบทันที ต่างกันที่โหมดฝึกทำจะเฉลยพร้อมคำอธิบายทันทีหลังตอบแต่ละข้อ ส่วนโหมดจำลองสอบจะเก็บเฉลยทั้งหมดไว้ให้ดูตอนทำเสร็จ'
    },
    order: { en: 'ORDER', th: 'ลำดับข้อ' },
    sequential: { en: 'Sequential', th: 'ตามลำดับ' },
    sequentialHint: { en: 'Questions in order', th: 'เรียงตามลำดับเดิม' },
    random: { en: 'Random', th: 'สุ่ม' },
    randomHint: { en: 'Shuffled questions', th: 'สลับลำดับข้อ' },
    domains: { en: 'DOMAINS', th: 'โดเมน' },
    selectAll: { en: 'Select all', th: 'เลือกทั้งหมด' },
    clearAll: { en: 'Clear all', th: 'ล้างทั้งหมด' },
    numQuestions: { en: 'Number of questions', th: 'จำนวนข้อ' },
    availableFmt: { en: '{n} question(s) available for this selection', th: 'มีโจทย์ {n} ข้อสำหรับตัวเลือกนี้' },
    startQuiz: { en: 'Start Quiz', th: 'เริ่มทำข้อสอบ' },
    needName: { en: 'Enter your name to begin — results are tracked per name.', th: 'กรอกชื่อก่อนเริ่ม — ระบบเก็บผลแยกตามชื่อ' },
    needDomain: { en: 'Select at least one domain.', th: 'เลือกอย่างน้อยหนึ่งโดเมน' },
    viewHistory: { en: 'View history', th: 'ดูประวัติ' },
    resumePrompt: { en: 'You have an unfinished quiz. Continue where you left off?', th: 'มีชุดข้อสอบที่ทำค้างไว้ ต้องการทำต่อหรือไม่' },
    resumeYes: { en: 'Resume', th: 'ทำต่อ' },
    resumeNo: { en: 'Discard', th: 'ทิ้งไป' },

    /* หน้าทำข้อสอบ */
    question: { en: 'QUESTION', th: 'ข้อที่' },
    finishNow: { en: 'Finish Now', th: 'จบทันที' },
    nextQuestion: { en: 'Next Question →', th: 'ข้อถัดไป →' },
    seeResults: { en: 'See Results →', th: 'ดูผลสรุป →' },
    submitAnswer: { en: 'Submit answer', th: 'ยืนยันคำตอบ' },
    selectN: { en: 'Select {n} answers', th: 'เลือก {n} ข้อ' },
    whyCorrect: { en: 'WHY THIS IS CORRECT', th: 'เฉลย' },
    flag: { en: 'Flag', th: 'ปักหมุด' },
    flagged: { en: 'Flagged', th: 'ปักหมุดแล้ว' },
    timeUp: { en: 'Time is up for this question.', th: 'หมดเวลาสำหรับข้อนี้' },
    confirmFinish: { en: 'Finish now? Unanswered questions will be marked incorrect.', th: 'จบการทำข้อสอบตอนนี้? ข้อที่ยังไม่ได้ตอบจะถูกนับว่าผิด' },
    confirmLeave: { en: 'Leave the quiz? Your progress is saved and you can resume later.', th: 'ออกจากการทำข้อสอบ? ระบบบันทึกความคืบหน้าไว้ให้ทำต่อได้ภายหลัง' },

    /* หน้าผลสรุป */
    resultTitle: { en: 'Result', th: 'ผลการทำข้อสอบ' },
    correct: { en: 'Correct', th: 'ตอบถูก' },
    wrong: { en: 'Wrong', th: 'ตอบผิด' },
    unanswered: { en: 'Unanswered', th: 'ไม่ได้ตอบ' },
    timeUsed: { en: 'Time used', th: 'เวลาที่ใช้' },
    passed: { en: 'PASSED', th: 'ผ่านเกณฑ์' },
    failed: { en: 'BELOW PASS MARK', th: 'ต่ำกว่าเกณฑ์' },
    byDomain: { en: 'Score by domain', th: 'คะแนนแยกตามโดเมน' },
    reviewAnswers: { en: 'Review answers', th: 'ดูเฉลยรายข้อ' },
    retryWrong: { en: 'Retry wrong only', th: 'ทำเฉพาะข้อที่ผิด' },
    newQuiz: { en: 'New quiz', th: 'เริ่มชุดใหม่' },
    exportResult: { en: 'Export JSON', th: 'ดาวน์โหลด JSON' },

    /* หน้าเฉลย */
    reviewTitle: { en: 'Review', th: 'เฉลยรายข้อ' },
    filterAll: { en: 'All', th: 'ทั้งหมด' },
    filterWrong: { en: 'Wrong only', th: 'เฉพาะข้อที่ผิด' },
    filterFlagged: { en: 'Flagged', th: 'ที่ปักหมุด' },
    yourAnswer: { en: 'Your answer', th: 'คำตอบของคุณ' },
    correctAnswer: { en: 'Correct answer', th: 'คำตอบที่ถูก' },
    noAnswer: { en: '(not answered)', th: '(ไม่ได้ตอบ)' },
    missingQuestion: { en: '(this question is no longer in the bank)', th: '(ข้อนี้ไม่มีอยู่ในคลังข้อสอบแล้ว)' },
    back: { en: '← Back', th: '← ย้อนกลับ' },

    /* หน้าประวัติ */
    historyTitle: { en: 'History', th: 'ประวัติการทำข้อสอบ' },
    historyEmpty: { en: 'No attempts recorded yet.', th: 'ยังไม่มีประวัติการทำข้อสอบ' },
    colName: { en: 'Name', th: 'ชื่อ' },
    colDate: { en: 'Date', th: 'วันที่' },
    colMode: { en: 'Mode', th: 'โหมด' },
    colDomains: { en: 'Domains', th: 'โดเมน' },
    colScore: { en: 'Score', th: 'คะแนน' },
    colTime: { en: 'Time', th: 'เวลา' },
    allNames: { en: 'Show everyone', th: 'แสดงทุกคน' },
    refresh: { en: 'Refresh', th: 'โหลดใหม่' },
    exportHistory: { en: 'Export all', th: 'ดาวน์โหลดทั้งหมด' },

    /* สถานะการซิงค์ */
    syncOk: { en: 'Synced to Google Sheets', th: 'ซิงค์ขึ้น Google Sheets แล้ว' },
    syncPendingFmt: { en: '{n} attempt(s) waiting to sync', th: 'รอซิงค์อยู่ {n} รายการ' },
    syncRetry: { en: 'Retry now', th: 'ลองใหม่' },
    syncLocalOnly: { en: 'Local only — Google Sheets is not configured', th: 'เก็บเฉพาะในเครื่อง — ยังไม่ได้ตั้งค่า Google Sheets' },
    syncFailed: { en: 'Could not reach Google Sheets. Saved locally.', th: 'ติดต่อ Google Sheets ไม่ได้ บันทึกไว้ในเครื่องแล้ว' },

    /* ทั่วไป */
    loading: { en: 'Loading…', th: 'กำลังโหลด…' },
    errorTitle: { en: 'Something went wrong', th: 'เกิดข้อผิดพลาด' },
    retry: { en: 'Try again', th: 'ลองใหม่' },
    minutesShort: { en: 'm', th: 'น.' },
    secondsShort: { en: 's', th: 'ว.' }
  };

  let mode = 'en';

  function uiLang() {
    return mode === 'th' ? 'th' : 'en';
  }

  /**
   * แปลข้อความตามคีย์
   * @param {string} key คีย์ใน STRINGS
   * @param {Object} [vars] ค่าที่จะแทนใน {placeholder}
   */
  function t(key, vars) {
    const entry = STRINGS[key];
    if (!entry) return key;

    const fill = (s) => {
      if (!vars) return s;
      return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    };

    return fill(entry[uiLang()]);
  }

  /** ดึงค่าจาก object สองภาษา { en, th } โดยมี fallback เป็นอังกฤษ */
  function pick(obj, lang) {
    if (!obj) return '';
    const l = lang || uiLang();
    const v = obj[l];
    if (v && String(v).trim()) return v;
    return obj.en || obj.th || '';
  }

  /** true เมื่อ object สองภาษานั้นมีคำแปลไทยครบ */
  function hasThai(obj) {
    return !!(obj && obj.th && String(obj.th).trim());
  }

  window.I18N = {
    t,
    pick,
    hasThai,
    get mode() {
      return mode;
    },
    set mode(v) {
      mode = v === 'th' ? 'th' : 'en';
    },
    uiLang,
    STRINGS
  };
})();
