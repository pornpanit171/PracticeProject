/**
 * app.js — ตัวควบคุมหน้าจอทั้งหมด
 *
 * ลำดับหน้าจอ:  gate → setup → quiz → result → review
 *                             ↖──── history ────↙
 */
(function () {
  const CFG = window.APP_CONFIG;
  const T = (k, v, dual) => window.I18N.t(k, v, dual);
  const P = (obj, lang) => window.I18N.pick(obj, lang);
  const $ = (id) => document.getElementById(id);

  const state = {
    lang: CFG.defaultLang || 'en',
    setup: {
      name: '',
      mode: 'practice',
      order: 'sequential',
      reveal: 'instant',
      domains: [],
      count: CFG.defaultCount || 50
    },
    session: null,
    lastAttempt: null,
    review: null, // { attempt, title }
    reviewFilter: 'all',
    historyAll: false,
    timerHandle: null,
    questionStart: 0,
    screen: 'loading'
  };

  /* ══════════════ helper ══════════════ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showScreen(name) {
    state.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    const target = $('screen-' + name);
    if (target) target.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function fmtClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtDuration(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}${T('minutesShort')} ${s % 60}${T('secondsShort')}` : `${s}${T('secondsShort')}`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || '';
    const locale = window.I18N.uiLang() === 'th' ? 'th-TH' : 'en-GB';
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function download(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** วาดข้อความลงใน container ตามภาษา UI ปัจจุบัน */
  function renderText(container, obj, mainClass) {
    container.appendChild(el('p', mainClass, P(obj)));
  }

  /** true เมื่อฟิลด์ "เพิ่มเติม" มีเนื้อหาอยู่จริง — กันไม่ให้โชว์กล่องเปล่า */
  function hasInsight(q) {
    return !!(q.insight && (String(q.insight.en || '').trim() || String(q.insight.th || '').trim()));
  }

  /* ══════════════ แถบภาษา / สถานะซิงค์ ══════════════ */

  function applyLang(lang) {
    state.lang = lang;
    window.I18N.mode = lang;
    document.documentElement.lang = lang === 'th' ? 'th' : 'en';
    for (const b of document.querySelectorAll('.lang-btn')) b.classList.toggle('active', b.dataset.lang === lang);
    window.Storage.setPref('lang', lang);
    rerender();
  }

  async function updateSyncBadge() {
    const badge = $('syncBadge');
    if (!window.Sheets.configured()) {
      // ยังไม่ได้ตั้งค่า Google Sheets — ไม่ต้องรกหน้าจอด้วยสถานะ ทำงานแบบเก็บเฉพาะเครื่องเงียบ ๆ
      badge.hidden = true;
      return;
    }
    const pending = await window.Storage.queueSize();
    badge.hidden = false;
    clear(badge);
    if (pending > 0) {
      badge.className = 'sync-badge warn';
      badge.appendChild(document.createTextNode(T('syncPendingFmt', { n: pending })));
      const retry = el('button', 'linkish', T('syncRetry'));
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        await window.Sheets.flush();
        updateSyncBadge();
      });
      badge.appendChild(retry);
    } else {
      badge.className = 'sync-badge ok';
      badge.textContent = T('syncOk');
    }
  }

  /** วาดหน้าจอปัจจุบันใหม่ เรียกเมื่อสลับภาษา */
  function rerender() {
    updateSyncBadge();
    $('btnSignOut').textContent = T('signOut');
    $('btnSignOut').hidden = !(window.Auth.required && window.Auth.session);

    switch (state.screen) {
      case 'gate': renderGate(); break;
      case 'setup': renderSetup(); break;
      case 'quiz': renderQuestion(); break;
      case 'result': renderResult(); break;
      case 'review': renderReview(); break;
      case 'history': renderHistory(); break;
      case 'loading': $('loadingText').textContent = T('loading'); break;
    }
  }

  /* ══════════════ ประตูรหัส ══════════════ */

  function renderGate() {
    $('gateTitle').textContent = T('gateTitle');
    $('gateHint').textContent = T('gateHint');
    $('gateCode').placeholder = T('gatePlaceholder');
    $('gateSubmit').textContent = T('gateSubmit');
    $('gateRememberLabel').textContent = T('gateRemember');

    // manifest ไม่ได้ถูกเข้ารหัส จึงอ่านชื่อคลังมาแสดงบนหน้าประตูได้ก่อนปลดล็อก
    if (gateManifest) {
      $('gateCreatedBy').textContent = P(gateManifest.title);
      document.title = P(gateManifest.title);
    }
  }

  let gateManifest = null;

  async function loadGateManifest() {
    try {
      const res = await fetch('data/manifest.json', { cache: 'no-cache' });
      if (res.ok) gateManifest = await res.json();
    } catch {
      /* ไม่มีก็แค่ไม่แสดงชื่อคลัง ไม่กระทบการปลดล็อก */
    }
  }

  function gateError(reason) {
    const box = $('gateError');
    const map = {
      wrong: 'gateWrong',
      expired: 'gateExpired',
      disabled: 'gateDisabled',
      insecure: 'gateInsecure',
      notconfigured: 'syncLocalOnly'
    };
    box.textContent = T(map[reason] || 'gateWrong');
    box.hidden = false;
  }

  async function handleGateSubmit(ev) {
    ev.preventDefault();
    const btn = $('gateSubmit');
    $('gateError').hidden = true;
    btn.disabled = true;
    try {
      const res = await window.Auth.unlock($('gateCode').value, $('gateRemember').checked);
      if (!res.ok) {
        gateError(res.reason);
        return;
      }
      $('gateCode').value = '';
      await bootAfterAuth();
    } catch (err) {
      showError(err);
    } finally {
      btn.disabled = false;
    }
  }

  /* ══════════════ หน้าตั้งค่า ══════════════ */

  function renderSetup() {
    const bank = window.Bank.state;
    const m = bank.manifest;

    $('setupTitle').textContent = P(m.title);
    $('setupSubtitle').textContent = P(m.subtitle);

    $('labelName').textContent = T('yourName');
    $('playerName').placeholder = T('namePlaceholder');
    $('labelMode').textContent = T('studyMode');
    $('labelOrder').textContent = T('order');
    $('labelDomains').textContent = T('domains');
    $('modeNote').textContent = T('modeNote');
    $('btnSelectAll').textContent = T('selectAll');
    $('btnClearAll').textContent = T('clearAll');
    $('labelCount').textContent = T('numQuestions');
    $('btnStart').textContent = T('startQuiz');
    $('btnHistory').textContent = T('viewHistory');
    $('resumeText').textContent = T('resumePrompt');
    $('btnResumeYes').textContent = T('resumeYes');
    $('btnResumeNo').textContent = T('resumeNo');

    for (const node of document.querySelectorAll('[data-i18n-title]')) node.textContent = T(node.dataset.i18nTitle);
    for (const node of document.querySelectorAll('[data-i18n-hint]')) node.textContent = T(node.dataset.i18nHint);

    // ชื่อผู้ทำ — ถ้ารหัสเป็นแบบรายคน จะล็อกชื่อไว้ให้เลย
    const locked = window.Auth.lockedName;
    const nameInput = $('playerName');
    if (locked) {
      nameInput.value = locked;
      nameInput.readOnly = true;
      state.setup.name = locked;
      $('nameLockedHint').hidden = false;
      $('nameLockedHint').textContent = '🔒 ' + locked;
    } else {
      nameInput.readOnly = false;
      nameInput.value = state.setup.name;
      $('nameLockedHint').hidden = true;
    }

    // การเฉลยผูกกับโหมดโดยตรง ไม่ได้ให้เลือกแยก
    // Practice = เฉลยทันทีหลังตอบแต่ละข้อ / Exam = เฉลยทั้งหมดตอนจบ
    state.setup.reveal = revealForMode(state.setup.mode);

    markGroup('modeGroup', state.setup.mode);
    markGroup('orderGroup', state.setup.order);

    renderDomainList();
    $('questionCount').value = state.setup.count;
    updateAvailable();
  }

  /** โหมดเป็นตัวกำหนดการเฉลย ไม่มีตัวเลือกแยกให้ผู้ใช้ */
  function revealForMode(mode) {
    return mode === 'exam' ? 'end' : 'instant';
  }

  function markGroup(groupId, value) {
    for (const b of $(groupId).querySelectorAll('.option')) b.classList.toggle('active', b.dataset.value === value);
  }

  /** โดเมนที่ควรแสดงในหน้า Setup — เฉพาะโดเมนที่มีโจทย์นำเข้าไว้จริงเท่านั้น */
  function visibleDomains() {
    return window.Bank.state.domains.filter((d) => d.count > 0);
  }

  function renderDomainList() {
    const list = $('domainList');
    clear(list);

    for (const d of visibleDomains()) {
      const on = state.setup.domains.includes(d.id);

      const row = el('label', 'domain-item' + (on ? ' on' : ''));
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = on;
      cb.addEventListener('change', () => {
        const set = new Set(state.setup.domains);
        if (cb.checked) set.add(d.id);
        else set.delete(d.id);
        state.setup.domains = [...set].sort((a, b) => a - b);
        row.classList.toggle('on', cb.checked);
        persistSetup();
        updateAvailable();
      });

      row.appendChild(cb);
      row.appendChild(el('span', 'domain-num', String(d.id)));
      row.appendChild(el('span', 'domain-name', P(d.name)));

      const meta = el('div', 'domain-meta');
      const full = d.thCount === d.count;
      meta.appendChild(el('span', 'th-badge' + (full ? '' : ' partial'), `TH ${d.thCount}/${d.count}`));
      meta.appendChild(el('span', 'domain-count', String(d.count)));
      row.appendChild(meta);

      list.appendChild(row);
    }
  }

  function availableCount() {
    return window.Bank.pool(state.setup.domains).length;
  }

  function updateAvailable() {
    const n = availableCount();
    $('availableText').textContent = T('availableFmt', { n });

    const nameOk = !!String($('playerName').value || '').trim();
    const domainOk = state.setup.domains.length > 0 && n > 0;
    $('btnStart').disabled = !(nameOk && domainOk);

    const err = $('startError');
    if (!nameOk) {
      err.textContent = T('needName');
      err.hidden = false;
    } else if (!domainOk) {
      err.textContent = T('needDomain');
      err.hidden = false;
    } else {
      err.hidden = true;
    }
  }

  function persistSetup() {
    window.Storage.setPref('setup', {
      name: state.setup.name,
      mode: state.setup.mode,
      order: state.setup.order,
      reveal: state.setup.reveal,
      domains: state.setup.domains,
      count: state.setup.count
    });
  }

  /* ══════════════ ทำข้อสอบ ══════════════ */

  function startQuiz(fromQids) {
    const bank = window.Bank.state;
    let pool = window.Bank.pool(state.setup.domains);
    let domains = state.setup.domains;

    if (fromQids && fromQids.length) {
      const wanted = new Set(fromQids);
      pool = fromQids.map((id) => window.Bank.byId(id)).filter(Boolean);
      domains = [...new Set(pool.map((q) => q.domain))].sort((a, b) => a - b);
      if (!pool.length) return;
    }

    state.session = window.Quiz.create({
      pool,
      name: state.setup.name,
      mode: state.setup.mode,
      order: state.setup.order,
      reveal: state.setup.reveal,
      count: fromQids ? pool.length : state.setup.count,
      domains,
      shuffleChoices: CFG.shuffleChoices === true,
      bankVersion: bank.version
    });

    persistSetup();
    showScreen('quiz');
    renderQuestion();
  }

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.questionStart = Date.now();
    const limit = Number(CFG.secondsPerQuestion) || 0;

    const timerEl = $('timer');
    timerEl.classList.toggle('hidden-timer', limit <= 0);
    if (limit <= 0) return;

    const tick = () => {
      const elapsed = (Date.now() - state.questionStart) / 1000;
      const left = limit - elapsed;
      $('timerText').textContent = fmtClock(left);
      timerEl.classList.toggle('urgent', left <= 10);
      if (left <= 0) {
        stopTimer();
        onTimeUp();
      }
    };
    tick();
    state.timerHandle = setInterval(tick, 250);
  }

  function onTimeUp() {
    const item = window.Quiz.current(state.session);
    if (!item || item.ok !== null) return;
    submitAnswer(item.picked.slice());
  }

  function elapsedMs() {
    return Date.now() - state.questionStart;
  }

  function renderQuestion() {
    const session = state.session;
    if (!session) return;

    const item = window.Quiz.current(session);
    const q = window.Bank.byId(item.qid);
    if (!q) {
      // โจทย์หายไปจากคลัง (ถูกลบหลังเริ่มทำ) — ข้ามไปข้อถัดไป
      if (window.Quiz.next(session)) return renderQuestion();
      return finishQuiz();
    }

    const isExam = session.mode === 'exam';
    const answered = item.ok !== null;
    const showAnswer = answered && session.reveal === 'instant';

    $('btnFinishNow').textContent = T('finishNow');
    $('progressCount').textContent = `${session.index + 1} / ${session.total}`;
    $('progressFill').style.width = ((session.index + (answered ? 1 : 0)) / session.total) * 100 + '%';

    // โหมดจำลองสอบไม่แสดงตัวนับถูกผิดระหว่างทำ
    const tally = $('tally');
    clear(tally);
    if (!isExam) {
      const p = window.Quiz.progress(session);
      const c = el('span', 'c', `✓ ${p.correct}`);
      const w = el('span', 'w', `✗ ${p.wrong}`);
      tally.appendChild(c);
      tally.appendChild(w);
    }

    const domain = window.Bank.domain(q.domain);
    $('domainChip').textContent = `Domain ${q.domain} · ${P(domain.name)}`;
    $('questionNo').textContent = `${T('question')} ${session.index + 1}`;

    const flagBtn = $('btnFlag');
    flagBtn.textContent = item.flagged ? '★ ' + T('flagged') : '☆ ' + T('flag');
    flagBtn.classList.toggle('on', !!item.flagged);

    const qText = $('questionText');
    clear(qText);
    renderText(qText, q.q, 'q-text');

    const multiHint = $('multiHint');
    multiHint.hidden = q.type !== 'multi';
    if (q.type === 'multi') multiHint.textContent = T('selectN', { n: q.answer.length });

    renderChoices(q, item, showAnswer);

    // ปุ่มยืนยันสำหรับข้อที่ตอบได้หลายตัวเลือก
    const submitBtn = $('btnSubmitAnswer');
    submitBtn.textContent = T('submitAnswer');
    submitBtn.hidden = !(q.type === 'multi' && !answered);
    submitBtn.disabled = item.picked.length === 0;

    // กล่องเฉลย
    const box = $('explainBox');
    if (showAnswer) {
      box.hidden = false;
      $('explainLabel').textContent = T('whyCorrect');
      const target = $('explainText');
      clear(target);
      renderText(target, q.explain, 'explain-en');
    } else {
      box.hidden = true;
    }

    // กล่องเพิ่มเติม — โชว์เฉพาะข้อที่มีเนื้อหาจริง
    const insightBox = $('insightBox');
    if (showAnswer && hasInsight(q)) {
      insightBox.hidden = false;
      $('insightLabel').textContent = T('additionalInsight');
      const target = $('insightText');
      clear(target);
      renderText(target, q.insight, '');
    } else {
      insightBox.hidden = true;
    }

    const nextBtn = $('btnNext');
    nextBtn.hidden = !answered;
    nextBtn.textContent = session.index >= session.total - 1 ? T('seeResults') : T('nextQuestion');

    if (!answered) startTimer();
    else stopTimer();

    saveResume();
  }

  function renderChoices(q, item, showAnswer) {
    const wrap = $('choices');
    clear(wrap);

    const order = item.choiceOrder && item.choiceOrder.length ? item.choiceOrder : q.choices.map((c) => c.k);
    const answered = item.ok !== null;

    for (const key of order) {
      const choice = q.choices.find((c) => c.k === key);
      if (!choice) continue;

      const btn = el('button', 'choice');
      btn.type = 'button';
      btn.dataset.key = key;
      btn.disabled = answered;

      const picked = item.picked.includes(key);
      if (showAnswer) {
        if (q.answer.includes(key)) btn.classList.add('correct');
        else if (picked) btn.classList.add('wrong');
      } else if (picked) {
        btn.classList.add('picked');
      }

      btn.appendChild(el('span', 'choice-key', key));

      const body = el('div', 'choice-body');
      body.appendChild(el('div', 'choice-en', P(choice)));
      btn.appendChild(body);

      btn.addEventListener('click', () => onChoiceClick(q, item, key));
      wrap.appendChild(btn);
    }
  }

  function onChoiceClick(q, item, key) {
    if (item.ok !== null) return;

    if (q.type === 'multi') {
      const set = new Set(item.picked);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      item.picked = [...set];
      renderQuestion();
    } else {
      submitAnswer([key]);
    }
  }

  function submitAnswer(keys) {
    stopTimer();
    window.Quiz.answer(state.session, keys, elapsedMs());
    renderQuestion();
  }

  function goNext() {
    if (window.Quiz.next(state.session)) renderQuestion();
    else finishQuiz();
  }

  function saveResume() {
    if (!state.session) return;
    window.Storage.saveResume({
      session: state.session,
      setup: state.setup,
      savedAt: new Date().toISOString()
    });
  }

  /* ══════════════ จบและสรุปผล ══════════════ */

  async function finishQuiz() {
    stopTimer();
    window.Quiz.finish(state.session);

    const attempt = window.Quiz.toAttempt(state.session);
    state.lastAttempt = attempt;

    await window.Storage.saveAttempt(attempt);
    await window.Storage.clearResume();

    showScreen('result');
    renderResult();

    // ส่งขึ้นชีต — ล้มเหลวก็เข้าคิวไว้ส่งใหม่ ไม่ขวางการใช้งาน
    if (window.Sheets.configured()) {
      const ok = await window.Sheets.submit(attempt);
      if (!ok) await window.Storage.enqueue(attempt);
    }
    updateSyncBadge();
  }

  function renderResult() {
    const attempt = state.lastAttempt;
    if (!attempt) return;

    $('resultEyebrow').textContent = `${T('resultTitle')} · ${attempt.name}`;
    $('scorePct').textContent = attempt.scorePct + '%';

    const pass = attempt.scorePct >= (CFG.passMark || 70);
    const verdict = $('scoreVerdict');
    verdict.textContent = pass ? T('passed') : T('failed');
    verdict.className = 'score-verdict ' + (pass ? 'pass' : 'fail');

    const stats = $('statRow');
    clear(stats);
    const cells = [
      { n: attempt.correct, label: T('correct'), cls: 'ok' },
      { n: attempt.wrong, label: T('wrong'), cls: 'bad' },
      { n: attempt.unanswered, label: T('unanswered'), cls: '' },
      { n: fmtDuration(attempt.durationSec), label: T('timeUsed'), cls: '' }
    ];
    for (const c of cells) {
      const box = el('div', 'stat');
      box.appendChild(el('div', 'stat-num ' + c.cls, String(c.n)));
      box.appendChild(el('div', 'stat-label', c.label));
      stats.appendChild(box);
    }

    $('labelByDomain').textContent = T('byDomain');
    const bd = $('domainBreakdown');
    clear(bd);
    for (const [domainId, s] of Object.entries(attempt.byDomain)) {
      const domain = window.Bank.domain(domainId);
      const pct = s.total ? Math.round((s.c / s.total) * 100) : 0;

      const row = el('div', 'bd-row');
      row.appendChild(el('span', 'bd-name', domain ? `${domainId}. ${P(domain.name)}` : `Domain ${domainId}`));
      const track = el('div', 'bd-track');
      const fill = el('div', 'bd-fill');
      fill.style.width = pct + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'bd-num', `${s.c}/${s.total}`));
      bd.appendChild(row);
    }

    $('btnReview').textContent = T('reviewAnswers');
    $('btnRetryWrong').textContent = T('retryWrong');
    $('btnNewQuiz').textContent = T('newQuiz');
    $('btnExportResult').textContent = T('exportResult');
    $('btnRetryWrong').hidden = attempt.wrong === 0;
  }

  /* ══════════════ เฉลยรายข้อ ══════════════ */

  function openReview(attempt) {
    state.review = attempt;
    state.reviewFilter = 'all';
    showScreen('review');
    renderReview();
  }

  function renderReview() {
    const attempt = state.review;
    if (!attempt) return;

    $('reviewTitle').textContent = `${T('reviewTitle')} · ${attempt.name || ''}`;
    $('btnReviewBack').textContent = T('back');

    const labels = { all: 'filterAll', wrong: 'filterWrong', flagged: 'filterFlagged' };
    for (const b of $('reviewFilter').querySelectorAll('.filter-btn')) {
      b.textContent = T(labels[b.dataset.filter]);
      b.classList.toggle('active', b.dataset.filter === state.reviewFilter);
    }

    const list = $('reviewList');
    clear(list);

    const items = attempt.items.filter((i) => {
      if (state.reviewFilter === 'wrong') return !i.ok;
      if (state.reviewFilter === 'flagged') return !!i.flagged;
      return true;
    });

    if (!items.length) {
      list.appendChild(el('p', 'empty', T('historyEmpty')));
      return;
    }

    for (const item of items) {
      const q = window.Bank.byId(item.qid);
      const card = el('article', 'card question-card review-item');

      const head = el('div', 'review-head');
      head.appendChild(el('span', 'verdict-dot ' + (item.ok ? 'ok' : 'bad'), item.ok ? '✓' : '✗'));
      head.appendChild(el('span', 'eyebrow', `${T('question')} ${item.seq}`));
      const domain = window.Bank.domain(item.domain);
      if (domain) head.appendChild(el('span', 'domain-chip', `Domain ${item.domain} · ${P(domain.name)}`));
      if (item.flagged) head.appendChild(el('span', 'pill', '★'));
      card.appendChild(head);

      if (!q) {
        card.appendChild(el('p', 'hint', T('missingQuestion') + ` [${item.qid}]`));
        list.appendChild(card);
        continue;
      }

      const qText = el('div');
      renderText(qText, q.q, 'q-text');
      card.appendChild(qText);

      const fakeItem = { picked: item.picked || [], ok: item.ok, choiceOrder: q.choices.map((c) => c.k) };
      const choicesWrap = el('div', 'choices');
      for (const choice of q.choices) {
        const row = el('div', 'choice');
        if (q.answer.includes(choice.k)) row.classList.add('correct');
        else if (fakeItem.picked.includes(choice.k)) row.classList.add('wrong');

        row.appendChild(el('span', 'choice-key', choice.k));
        const body = el('div', 'choice-body');
        body.appendChild(el('div', 'choice-en', P(choice)));
        row.appendChild(body);
        choicesWrap.appendChild(row);
      }
      card.appendChild(choicesWrap);

      const line = el('p', 'answer-line');
      line.appendChild(document.createTextNode(T('yourAnswer') + ': '));
      const yours = el('b', null, fakeItem.picked.length ? fakeItem.picked.join(', ') : T('noAnswer'));
      line.appendChild(yours);
      line.appendChild(document.createTextNode('   ·   ' + T('correctAnswer') + ': '));
      line.appendChild(el('b', null, q.answer.join(', ')));
      card.appendChild(line);

      const explain = el('div', 'explain');
      explain.appendChild(el('p', 'explain-label', T('whyCorrect')));
      const body = el('div');
      renderText(body, q.explain, 'explain-en');
      explain.appendChild(body);
      card.appendChild(explain);

      if (hasInsight(q)) {
        const insight = el('div', 'explain insight');
        insight.appendChild(el('p', 'explain-label', T('additionalInsight')));
        const insightBody = el('div', 'insight-text');
        renderText(insightBody, q.insight, '');
        insight.appendChild(insightBody);
        card.appendChild(insight);
      }

      list.appendChild(card);
    }
  }

  /* ══════════════ ประวัติ ══════════════ */

  async function openHistory() {
    showScreen('history');
    $('historyBody').textContent = T('loading');
    renderHistoryChrome();
    await loadHistory();
  }

  function renderHistoryChrome() {
    $('historyTitle').textContent = T('historyTitle');
    $('btnHistoryBack').textContent = T('back');
    $('btnHistoryRefresh').textContent = T('refresh');
    $('btnHistoryExport').textContent = T('exportHistory');
    $('historyAllLabel').textContent = T('allNames');
    $('historyAllNames').checked = state.historyAll;
  }

  async function loadHistory() {
    const name = state.historyAll ? '' : state.setup.name;
    let rows = await window.Sheets.list(name);

    // ชีตล่มหรือยังไม่ได้ตั้งค่า → ใช้แคชในเครื่องแทน
    if (rows === null) rows = await window.Storage.listAttempts(name || undefined);

    state.historyRows = rows || [];
    renderHistory();
  }

  function renderHistory() {
    renderHistoryChrome();
    const body = $('historyBody');
    clear(body);

    const rows = state.historyRows || [];
    if (!rows.length) {
      body.appendChild(el('p', 'empty', T('historyEmpty')));
      return;
    }

    const wrap = el('div', 'table-wrap');
    const table = el('table', 'history');

    const thead = el('thead');
    const hr = el('tr');
    for (const key of ['colDate', 'colMode', 'colDomains', 'colScore', 'colTime']) {
      hr.appendChild(el('th', null, T(key)));
    }
    if (state.historyAll) hr.insertBefore(el('th', null, T('colName')), hr.firstChild);
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const r of rows) {
      const tr = el('tr');
      if (state.historyAll) tr.appendChild(el('td', null, r.name || ''));
      tr.appendChild(el('td', null, fmtDate(r.finishedAt || r.startedAt)));
      tr.appendChild(el('td', null, r.mode === 'exam' ? T('exam') : T('practice')));

      const domains = Array.isArray(r.domains) ? r.domains : String(r.domains || '').split(',').filter(Boolean);
      tr.appendChild(el('td', null, domains.join(', ')));

      const pct = Number(r.scorePct) || 0;
      const scoreCell = el('td', 'score-cell ' + (pct >= (CFG.passMark || 70) ? 'pass' : 'fail'));
      scoreCell.textContent = `${r.correct}/${r.total} · ${pct}%`;
      tr.appendChild(scoreCell);

      tr.appendChild(el('td', null, fmtDuration(Number(r.durationSec) || 0)));

      tr.addEventListener('click', () => openHistoryDetail(r));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    body.appendChild(wrap);
  }

  async function openHistoryDetail(row) {
    // รายการจากชีตมีแค่ส่วนสรุป ต้องไปดึงรายข้อเพิ่ม
    if (row.items && row.items.length) return openReview(row);

    const local = await window.Storage.getAttempt(row.attemptId);
    if (local && local.items) return openReview(local);

    const remote = await window.Sheets.detail(row.attemptId);
    if (remote && remote.items) return openReview({ ...row, items: remote.items });

    openReview({ ...row, items: [] });
  }

  /* ══════════════ ข้อผิดพลาด ══════════════ */

  function showError(err) {
    console.error(err);
    showScreen('error');
    $('errorTitle').textContent = T('errorTitle');
    $('errorDetail').textContent = String((err && err.message) || err);
    $('btnErrorRetry').textContent = T('retry');
  }

  /* ══════════════ เริ่มระบบ ══════════════ */

  async function bootAfterAuth() {
    showScreen('loading');
    $('loadingText').textContent = T('loading');
    $('btnSignOut').hidden = !(window.Auth.required && window.Auth.session);

    try {
      await window.Bank.load();
    } catch (err) {
      showError(err);
      return;
    }

    // คืนค่าตัวเลือกล่าสุด — ถ้าไม่เคยทำมาก่อน ปล่อยให้โดเมนว่างไว้ ผู้ใช้เลือกเอง
    const saved = await window.Storage.getPref('setup', null);
    if (saved) {
      state.setup = { ...state.setup, ...saved };
      const valid = new Set(window.Bank.state.domains.map((d) => d.id));
      state.setup.domains = (state.setup.domains || []).filter((id) => valid.has(id));
    }
    if (window.Auth.lockedName) state.setup.name = window.Auth.lockedName;

    showScreen('setup');
    renderSetup();

    // ชุดที่ทำค้างไว้
    const resume = await window.Storage.loadResume();
    $('resumeBox').hidden = !resume;
    if (resume) state.pendingResume = resume;

    window.Sheets.flush().then(updateSyncBadge);
    updateSyncBadge();
  }

  function bindEvents() {
    for (const b of document.querySelectorAll('.lang-btn')) {
      b.addEventListener('click', () => applyLang(b.dataset.lang));
    }

    $('btnSignOut').addEventListener('click', () => {
      window.Auth.signOut();
      showScreen('gate');
      renderGate();
      $('btnSignOut').hidden = true;
    });

    $('gateForm').addEventListener('submit', handleGateSubmit);

    // หน้าตั้งค่า
    $('playerName').addEventListener('input', (e) => {
      state.setup.name = e.target.value.trim();
      persistSetup();
      updateAvailable();
    });

    $('modeGroup').addEventListener('click', (e) => {
      const btn = e.target.closest('.option');
      if (!btn) return;
      state.setup.mode = btn.dataset.value;
      state.setup.reveal = revealForMode(state.setup.mode);
      persistSetup();
      renderSetup();
    });

    $('orderGroup').addEventListener('click', (e) => {
      const btn = e.target.closest('.option');
      if (!btn) return;
      state.setup.order = btn.dataset.value;
      persistSetup();
      markGroup('orderGroup', state.setup.order);
    });

    $('btnSelectAll').addEventListener('click', () => {
      state.setup.domains = visibleDomains().map((d) => d.id);
      persistSetup();
      renderDomainList();
      updateAvailable();
    });

    $('btnClearAll').addEventListener('click', () => {
      state.setup.domains = [];
      persistSetup();
      renderDomainList();
      updateAvailable();
    });

    $('questionCount').addEventListener('input', (e) => {
      state.setup.count = Math.max(1, Number(e.target.value) || 1);
      persistSetup();
    });

    $('btnStart').addEventListener('click', () => startQuiz());
    $('btnHistory').addEventListener('click', openHistory);

    $('btnResumeYes').addEventListener('click', () => {
      const r = state.pendingResume;
      if (!r) return;
      state.session = r.session;
      state.setup = { ...state.setup, ...r.setup };
      $('resumeBox').hidden = true;
      showScreen('quiz');
      renderQuestion();
    });

    $('btnResumeNo').addEventListener('click', async () => {
      state.pendingResume = null;
      await window.Storage.clearResume();
      $('resumeBox').hidden = true;
    });

    // หน้าทำข้อสอบ
    $('btnNext').addEventListener('click', goNext);
    $('btnSubmitAnswer').addEventListener('click', () => {
      const item = window.Quiz.current(state.session);
      if (item && item.picked.length) submitAnswer(item.picked.slice());
    });

    $('btnFlag').addEventListener('click', () => {
      const item = window.Quiz.current(state.session);
      if (!item) return;
      item.flagged = !item.flagged;
      renderQuestion();
    });

    $('btnFinishNow').addEventListener('click', () => {
      if (confirm(T('confirmFinish'))) finishQuiz();
    });

    // หน้าผลสรุป
    $('btnReview').addEventListener('click', () => openReview(state.lastAttempt));
    $('btnNewQuiz').addEventListener('click', () => {
      showScreen('setup');
      renderSetup();
    });
    $('btnRetryWrong').addEventListener('click', () => {
      const wrongIds = state.lastAttempt.items.filter((i) => !i.ok).map((i) => i.qid);
      startQuiz(wrongIds);
    });
    $('btnExportResult').addEventListener('click', () => {
      download(`attempt-${state.lastAttempt.attemptId}.json`, state.lastAttempt);
    });

    // หน้าเฉลย
    $('btnReviewBack').addEventListener('click', () => {
      showScreen(state.lastAttempt && state.review === state.lastAttempt ? 'result' : 'history');
      rerender();
    });
    $('reviewFilter').addEventListener('click', (e) => {
      const b = e.target.closest('.filter-btn');
      if (!b) return;
      state.reviewFilter = b.dataset.filter;
      renderReview();
    });

    // หน้าประวัติ
    $('btnHistoryBack').addEventListener('click', () => {
      showScreen('setup');
      renderSetup();
    });
    $('btnHistoryRefresh').addEventListener('click', loadHistory);
    $('historyAllNames').addEventListener('change', (e) => {
      state.historyAll = e.target.checked;
      loadHistory();
    });
    $('btnHistoryExport').addEventListener('click', async () => {
      const all = await window.Storage.listAttempts();
      download('quiz-history.json', { exportedAt: new Date().toISOString(), attempts: all });
    });

    $('btnErrorRetry').addEventListener('click', () => location.reload());

    // คีย์ลัดระหว่างทำข้อสอบ
    document.addEventListener('keydown', (e) => {
      if (state.screen !== 'quiz') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const item = window.Quiz.current(state.session);
      if (!item) return;

      if (e.key === 'Enter') {
        if (!$('btnNext').hidden) goNext();
        else if (!$('btnSubmitAnswer').hidden && item.picked.length) submitAnswer(item.picked.slice());
        return;
      }

      const q = window.Bank.byId(item.qid);
      if (!q || item.ok !== null) return;

      let key = null;
      if (/^[a-fA-F]$/.test(e.key)) key = e.key.toUpperCase();
      else if (/^[1-6]$/.test(e.key)) key = String.fromCharCode(64 + Number(e.key));
      if (key && q.choices.some((c) => c.k === key)) {
        e.preventDefault();
        onChoiceClick(q, item, key);
      }
    });

    // เตือนเมื่อกำลังจะปิดหน้าระหว่างทำข้อสอบ
    window.addEventListener('beforeunload', (e) => {
      if (state.screen === 'quiz' && state.session) {
        saveResume();
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  async function init() {
    bindEvents();

    const savedLang = await window.Storage.getPref('lang', CFG.defaultLang || 'en');
    applyLang(savedLang);

    if (window.Auth.required && !window.Auth.restore()) {
      showScreen('gate');
      renderGate();
      await loadGateManifest();
      renderGate();
      return;
    }
    await bootAfterAuth();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
