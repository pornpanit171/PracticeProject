/**
 * Code.gs — ฝั่งเซิร์ฟเวอร์ของระบบ ทำ 2 หน้าที่:
 *   1. เก็บประวัติการทำข้อสอบลง Google Sheets (ทุกคนใช้ได้ ไม่ต้องมีสิทธิ์พิเศษ)
 *   2. เผยแพร่โจทย์ที่นำเข้าจาก tools/import.html เข้า GitHub repo โดยตรง (เฉพาะ admin)
 *
 * ติดตั้งครั้งเดียวโดยเจ้าของระบบ — ดูขั้นตอนละเอียดใน SHEETS_SETUP.md
 *   1. สร้าง Google Sheet เปล่า
 *   2. Extensions → Apps Script แล้ววางไฟล์นี้ทับทั้งหมด
 *   3. เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง (จะสร้างแท็บและคีย์ให้เอง)
 *   4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *   5. ก๊อป URL ที่ลงท้าย /exec กับคีย์จากแท็บ Meta ไปใส่ใน assets/config.js
 *
 * ถ้าต้องการเปิดใช้ "เผยแพร่โจทย์เข้าเว็บโดยตรง" ด้วย ทำเพิ่มอีก 2 ขั้น
 * (ไม่ทำก็ได้ ระบบจะยังใช้งานได้ปกติ แค่ import.html จะไม่มีปุ่มเผยแพร่) — ดู PUBLISH_SETUP.md
 *   6. Project Settings → Script Properties → เพิ่ม GITHUB_TOKEN (fine-grained PAT, Contents: Read and write, เฉพาะ repo นี้)
 *   7. เติมค่าในแท็บ Meta: githubOwner, githubRepo, githubBranch (default main)
 *
 * การเก็บประวัติออกแบบให้ "เพิ่มได้อย่างเดียว" — ไม่มี action สำหรับลบหรือแก้แถวเดิม
 * ถ้ามีคนยิงข้อมูลมั่วเข้ามา ของเก่าจะไม่หาย และเปลี่ยน URL ใหม่ได้ด้วยการ Deploy ใหม่
 *
 * ส่วนการเผยแพร่โจทย์ต่างออกไป — เขียนทับไฟล์ใน repo ได้จริง จึงกันด้วยคีย์แยกต่างหาก (publishKey)
 * ที่ไม่ได้ฝังอยู่ในไฟล์สาธารณะใด ๆ เลย และ "ปิดไว้ก่อนเป็นค่าเริ่มต้น" (fail-closed) —
 * ต่างจากคีย์อื่น ๆ ในระบบนี้ที่ถ้ายังไม่ตั้งจะปล่อยผ่าน (fail-open) เพราะการเขียนเข้า repo
 * มีความเสี่ยงสูงกว่าการเพิ่มแถวในชีตมาก
 */

/* ═════════ ค่าคงที่ ═════════ */

var SHEET_ATTEMPTS = 'Attempts';
var SHEET_ANSWERS = 'Answers';
var SHEET_CODES = 'Codes';
var SHEET_META = 'Meta';

var MAX_ITEMS_PER_ATTEMPT = 500;   // กันคนยิง payload ใหญ่ถล่มชีต
var MAX_LIST_ROWS = 300;           // จำนวนประวัติสูงสุดที่ส่งกลับต่อครั้ง

var HEAD_ATTEMPTS = [
  'attempt_id', 'timestamp', 'name', 'mode', 'order', 'reveal', 'domains',
  'total', 'correct', 'wrong', 'unanswered', 'score_pct', 'duration_sec',
  'started_at', 'finished_at', 'bank_version'
];

var HEAD_ANSWERS = ['attempt_id', 'seq', 'qid', 'domain', 'picked', 'is_correct', 'time_ms', 'flagged'];

var HEAD_CODES = ['code', 'name', 'active', 'expires', 'max_uses', 'used', 'note'];

/* ═════════ ติดตั้งครั้งแรก ═════════ */

/**
 * รันฟังก์ชันนี้หนึ่งครั้งหลังวางโค้ด — สร้างแท็บทั้งหมดพร้อมหัวคอลัมน์
 * รันซ้ำได้ ไม่ลบข้อมูลเดิม
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEET_ATTEMPTS, HEAD_ATTEMPTS);
  ensureSheet_(ss, SHEET_ANSWERS, HEAD_ANSWERS);
  var codes = ensureSheet_(ss, SHEET_CODES, HEAD_CODES);
  var meta = ensureSheet_(ss, SHEET_META, ['key', 'value', 'note']);

  // ใส่ตัวอย่างรหัสให้ดูเป็นแบบ ถ้ายังไม่มีข้อมูลเลย
  if (codes.getLastRow() < 2) {
    codes.appendRow(['CISSP-2026', '', true, '', '', 0, 'รหัสกลาง — เว้น name ว่างไว้ ผู้ใช้จะพิมพ์ชื่อเอง']);
    codes.appendRow(['CISSP-GOTJI', 'Gotji', true, '', 50, 0, 'รหัสรายคน — ระบบจะล็อกชื่อให้ตามคอลัมน์ name']);
  }

  // สร้างคีย์ถ้ายังไม่มี
  if (!getMeta_('apiKey')) {
    setMeta_('apiKey', randomKey_(24), 'ใส่ค่านี้ใน assets/config.js → sheetsKey');
  }
  if (!getMeta_('encKey')) {
    setMeta_('encKey', randomKey_(32), 'กุญแจ AES สำหรับระบบรหัสระดับ 3 (ยังไม่ใช้ในระดับ 1)');
  }
  if (!getMeta_('publishKey')) {
    setMeta_(
      'publishKey',
      randomKey_(28),
      'คีย์สำหรับปุ่ม "เผยแพร่ขึ้นเว็บเลย" ใน tools/import.html — อย่าใส่ค่านี้ใน assets/config.js หรือไฟล์ใด ๆ ที่ commit ' +
        'เข้า repo เด็ดขาด ก๊อปไปวางตอนที่ import.html ถามหาเท่านั้น (ระบบจะจำไว้ในเบราว์เซอร์เครื่องนั้นให้)'
    );
  }
  // ค่าที่ต้องกรอกเองสำหรับฟีเจอร์เผยแพร่ขึ้น GitHub — ไม่บังคับ เว้นว่างไว้ได้ถ้ายังไม่ใช้ปุ่มเผยแพร่
  if (!getMeta_('githubOwner')) setMeta_('githubOwner', '', 'เช่น pornpanit171 — ต้องกรอกเองถ้าจะใช้ปุ่มเผยแพร่');
  if (!getMeta_('githubRepo')) setMeta_('githubRepo', '', 'เช่น PracticeProject — ต้องกรอกเองถ้าจะใช้ปุ่มเผยแพร่');
  if (!getMeta_('githubBranch')) setMeta_('githubBranch', 'main', 'branch ที่จะเผยแพร่ไปลง ปกติคือ main');

  // จัดหน้าตาให้อ่านง่าย
  [SHEET_ATTEMPTS, SHEET_ANSWERS, SHEET_CODES, SHEET_META].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  });

  var url = ScriptApp.getService().getUrl();
  var msg =
    'ติดตั้งเรียบร้อย\n\n' +
    'sheetsKey: ' + getMeta_('apiKey') + '\n' +
    'sheetsUrl: ' + (url || '(ยังไม่ได้ Deploy — ทำขั้นตอน Deploy แล้วค่อยก๊อป URL จากหน้านั้น)') + '\n\n' +
    'นำสองค่านี้ไปใส่ใน assets/config.js\n\n' +
    'ถ้าต้องการเปิดปุ่ม "เผยแพร่ขึ้นเว็บเลย" ใน tools/import.html เพิ่มเติม:\n' +
    'publishKey: ' + getMeta_('publishKey') + ' (เก็บไว้ อย่า commit ลง repo)\n' +
    'แล้วดูขั้นตอนที่เหลือใน PUBLISH_SETUP.md';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (err) {
    // เรียกจากที่ที่ไม่มี UI ก็ข้ามไป ดูค่าได้จาก Logger
  }
  return msg;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function randomKey_(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function getMeta_(key) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_META);
  if (!sh || sh.getLastRow() < 2) return '';
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === key) return String(rows[i][1]);
  return '';
}

function setMeta_(key, value, note) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_META);
  sh.appendRow([key, value, note || '']);
}

/* ═════════ ตัวช่วยตอบกลับ ═════════ */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(reason) {
  return json_({ ok: false, reason: reason });
}

/** ตรวจคีย์ — ถ้าในชีตยังไม่ได้ตั้ง apiKey ไว้ ก็ปล่อยผ่าน (fail-open ตั้งใจให้ตั้งค่าง่ายตอนเริ่มต้น) */
function checkKey_(key) {
  var expected = getMeta_('apiKey');
  if (!expected) return true;
  return String(key || '') === expected;
}

/** ตรวจคีย์เผยแพร่ — action นี้เขียนเข้า repo ได้จริง จึง fail-closed เสมอ ต้องตั้ง publishKey ไว้ก่อนถึงจะใช้ได้ */
function checkPublishKey_(key) {
  var expected = getMeta_('publishKey');
  if (!expected) return false;
  return String(key || '') === expected;
}

/* ═════════ GET — อ่านประวัติ ═════════ */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (!checkKey_(p.key)) return fail_('badkey');

    switch (p.action) {
      case 'ping':
        return json_({ ok: true, at: new Date().toISOString() });
      case 'list':
        return listAttempts_(p.name);
      case 'attempt':
        return getAttempt_(p.id);
      default:
        return fail_('unknownaction');
    }
  } catch (err) {
    return fail_(String(err));
  }
}

function listAttempts_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ATTEMPTS);
  if (!sh || sh.getLastRow() < 2) return json_({ ok: true, attempts: [] });

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD_ATTEMPTS.length).getValues();
  var wanted = String(name || '').trim();
  var out = [];

  // ไล่จากล่างขึ้นบนเพื่อให้ได้รายการล่าสุดก่อน
  for (var i = values.length - 1; i >= 0 && out.length < MAX_LIST_ROWS; i--) {
    var r = values[i];
    if (!r[0]) continue;
    if (wanted && String(r[2]).trim() !== wanted) continue;

    out.push({
      attemptId: String(r[0]),
      name: String(r[2]),
      mode: String(r[3]),
      order: String(r[4]),
      reveal: String(r[5]),
      domains: String(r[6]).split(',').filter(String).map(Number),
      total: Number(r[7]),
      correct: Number(r[8]),
      wrong: Number(r[9]),
      unanswered: Number(r[10]),
      scorePct: Number(r[11]),
      durationSec: Number(r[12]),
      startedAt: toIso_(r[13]),
      finishedAt: toIso_(r[14]),
      bankVersion: String(r[15])
    });
  }
  return json_({ ok: true, attempts: out });
}

function getAttempt_(attemptId) {
  var id = String(attemptId || '').trim();
  if (!id) return fail_('noid');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANSWERS);
  if (!sh || sh.getLastRow() < 2) return json_({ ok: true, items: [] });

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD_ANSWERS.length).getValues();
  var items = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (String(r[0]) !== id) continue;
    items.push({
      seq: Number(r[1]),
      qid: String(r[2]),
      domain: Number(r[3]),
      picked: String(r[4]).split(',').filter(String),
      ok: r[5] === true || String(r[5]).toUpperCase() === 'TRUE',
      ms: Number(r[6]),
      flagged: r[7] === true || String(r[7]).toUpperCase() === 'TRUE'
    });
  }
  items.sort(function (a, b) {
    return a.seq - b.seq;
  });
  return json_({ ok: true, attemptId: id, items: items });
}

function toIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || '');
}

/* ═════════ POST — บันทึกผล / ตรวจรหัส ═════════ */

function doPost(e) {
  try {
    var body = {};
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return fail_('badjson');
    }

    if (!checkKey_(body.key)) return fail_('badkey');

    switch (body.action) {
      case 'submit':
        return submitAttempt_(body.attempt);
      case 'unlock':
        return unlockCode_(body.code);
      case 'publish':
        return publishFiles_(body);
      default:
        return fail_('unknownaction');
    }
  } catch (err) {
    return fail_(String(err));
  }
}

function submitAttempt_(a) {
  if (!a || !a.attemptId) return fail_('noattempt');

  var items = Array.isArray(a.items) ? a.items.slice(0, MAX_ITEMS_PER_ATTEMPT) : [];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shA = ss.getSheetByName(SHEET_ATTEMPTS);
    var shN = ss.getSheetByName(SHEET_ANSWERS);
    if (!shA || !shN) return fail_('notsetup');

    // กันส่งซ้ำ — ถ้ามี attempt_id นี้แล้วให้ถือว่าสำเร็จโดยไม่เขียนซ้ำ
    if (shA.getLastRow() >= 2) {
      var ids = shA.getRange(2, 1, shA.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(a.attemptId)) return json_({ ok: true, duplicate: true });
      }
    }

    shA.appendRow([
      a.attemptId,
      new Date(),
      String(a.name || ''),
      String(a.mode || ''),
      String(a.order || ''),
      String(a.reveal || ''),
      (a.domains || []).join(','),
      Number(a.total || 0),
      Number(a.correct || 0),
      Number(a.wrong || 0),
      Number(a.unanswered || 0),
      Number(a.scorePct || 0),
      Number(a.durationSec || 0),
      String(a.startedAt || ''),
      String(a.finishedAt || ''),
      String(a.bankVersion || '')
    ]);

    if (items.length) {
      var rows = items.map(function (it) {
        return [
          a.attemptId,
          Number(it.seq || 0),
          String(it.qid || ''),
          Number(it.domain || 0),
          (it.picked || []).join(','),
          it.ok === true,
          Number(it.ms || 0),
          it.flagged === true
        ];
      });
      shN.getRange(shN.getLastRow() + 1, 1, rows.length, HEAD_ANSWERS.length).setValues(rows);
    }

    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตรวจรหัสเข้าใช้งาน (ใช้เมื่ออัปเกรดเป็นระบบรหัสระดับ 3)
 * คืนชื่อที่ผูกกับรหัส และกุญแจถอดรหัสไฟล์โจทย์
 */
function unlockCode_(code) {
  var want = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!want) return fail_('wrong');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CODES);
  if (!sh || sh.getLastRow() < 2) return fail_('wrong');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD_CODES.length).getValues();

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (String(r[0]).trim().toUpperCase().replace(/\s+/g, '') !== want) continue;

      if (r[2] === false || String(r[2]).toUpperCase() === 'FALSE') return fail_('disabled');

      if (r[3]) {
        var end = r[3] instanceof Date ? r[3] : new Date(String(r[3]) + 'T23:59:59');
        if (!isNaN(end.getTime()) && new Date() > end) return fail_('expired');
      }

      var maxUses = Number(r[4]) || 0;
      var used = Number(r[5]) || 0;
      if (maxUses > 0 && used >= maxUses) return fail_('exhausted');

      sh.getRange(i + 2, 6).setValue(used + 1);

      return json_({
        ok: true,
        name: String(r[1] || ''),
        key: getMeta_('encKey'),
        label: String(r[0]).slice(0, 4) + '****'
      });
    }
    return fail_('wrong');
  } finally {
    lock.releaseLock();
  }
}

/* ═════════ เผยแพร่โจทย์เข้า GitHub โดยตรง ═════════ */

var MAX_PUBLISH_FILES = 20;   // กันคนยิงไฟล์เยอะเกินไปต่อครั้ง
var MAX_FILE_BYTES = 500000;  // กันไฟล์โจทย์ใหญ่ผิดปกติ (โจทย์ปกติไม่ถึง 50KB ต่อโดเมน)

function ghConfig_() {
  return {
    token: PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'),
    owner: getMeta_('githubOwner'),
    repo: getMeta_('githubRepo'),
    branch: getMeta_('githubBranch') || 'main'
  };
}

/**
 * รับไฟล์ JSON ที่ผ่านการตรวจจาก tools/import.html แล้ว เขียนทับ/สร้างใหม่เข้า GitHub repo ตรง ๆ
 * body: { publishKey, files: [{ path, content }], message }
 * path ต้องขึ้นต้นด้วย "data/" และเป็น .json เท่านั้น — กันไม่ให้เผลอเขียนทับไฟล์อื่นในเว็บ
 */
function publishFiles_(body) {
  if (!checkPublishKey_(body.publishKey)) return fail_('badpublishkey');

  var cfg = ghConfig_();
  if (!cfg.token || !cfg.owner || !cfg.repo) return fail_('notconfigured');

  var files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return fail_('nofiles');
  if (files.length > MAX_PUBLISH_FILES) return fail_('toomanyfiles');

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !/^data\/[A-Za-z0-9_\-.]+\.json$/.test(String(f.path || ''))) return fail_('invalidpath');
    if (String(f.content || '').length > MAX_FILE_BYTES) return fail_('filetoolarge');
  }

  var message = String(body.message || 'อัปเดตโจทย์ผ่าน import.html').slice(0, 200);
  var results = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    for (var j = 0; j < files.length; j++) {
      var file = files[j];
      try {
        var sha = ghGetSha_(cfg, file.path);
        ghPutFile_(cfg, file.path, file.content, sha, message);
        results.push({ path: file.path, ok: true });
      } catch (err) {
        results.push({ path: file.path, ok: false, error: String(err) });
      }
    }
  } finally {
    lock.releaseLock();
  }

  var allOk = results.every(function (r) {
    return r.ok;
  });
  return json_({ ok: allOk, results: results });
}

/** คืน sha ของไฟล์ที่มีอยู่แล้วใน repo (ใช้ตอนแก้ไฟล์เดิม) หรือ null ถ้ายังไม่มีไฟล์นี้ (สร้างใหม่ได้เลย) */
function ghGetSha_(cfg, path) {
  var url = ghApiUrl_(cfg, path) + '?ref=' + encodeURIComponent(cfg.branch);
  var res = UrlFetchApp.fetch(url, {
    headers: ghHeaders_(cfg),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 200) return JSON.parse(res.getContentText()).sha;
  if (res.getResponseCode() === 404) return null;
  throw new Error('อ่านไฟล์เดิมไม่สำเร็จ HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
}

/** เขียนไฟล์เข้า GitHub ผ่าน Contents API — มี sha แปลว่าแก้ไฟล์เดิม ไม่มีแปลว่าสร้างใหม่ */
function ghPutFile_(cfg, path, content, sha, message) {
  var payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: cfg.branch
  };
  if (sha) payload.sha = sha;

  var res = UrlFetchApp.fetch(ghApiUrl_(cfg, path), {
    method: 'put',
    contentType: 'application/json',
    headers: ghHeaders_(cfg),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API ' + code + ': ' + res.getContentText().slice(0, 300));
  }
}

function ghApiUrl_(cfg, path) {
  return (
    'https://api.github.com/repos/' +
    encodeURIComponent(cfg.owner) +
    '/' +
    encodeURIComponent(cfg.repo) +
    '/contents/' +
    path // path มาจากรายการที่ตรวจแล้วว่าตรง ^data/[A-Za-z0-9_\-.]+\.json$ เท่านั้น ไม่ต้อง encode ทีละ segment
  );
}

function ghHeaders_(cfg) {
  return {
    Authorization: 'token ' + cfg.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}
