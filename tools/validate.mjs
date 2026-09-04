#!/usr/bin/env node
/**
 * validate.mjs — ตรวจความถูกต้องของคลังข้อสอบทั้งหมดในโฟลเดอร์ data/
 *
 * รันเองก่อน commit:      node tools/validate.mjs
 * และรันอัตโนมัติทุก push โดย .github/workflows/validate.yml
 *
 * เจอ error → exit code 1 (CI ขึ้นกากบาทแดง)
 * เจอ warning → รายงานให้เห็นแต่ยังผ่าน
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const errors = [];
const warnings = [];

const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(relPath) {
  const full = join(DATA, relPath);
  if (!existsSync(full)) {
    err(relPath, 'ไม่พบไฟล์');
    return null;
  }
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    err(relPath, `JSON ไม่ถูกต้อง — ${e.message}`);
    return null;
  }
}

/* ─── manifest ─── */
const manifest = readJson('manifest.json');
if (manifest) {
  if (!manifest.version) warn('manifest.json', 'ไม่มี version — เบราว์เซอร์อาจแคชโจทย์เก่าไว้');
  for (const key of ['title', 'subtitle']) {
    if (!manifest[key] || !manifest[key].en) err('manifest.json', `${key}.en ว่าง`);
    else if (!manifest[key].th) warn('manifest.json', `${key}.th ว่าง`);
  }
}

/* ─── domains ─── */
const domains = readJson((manifest && manifest.domainsFile) || 'domains.json');
if (!Array.isArray(domains)) {
  err('domains.json', 'ต้องเป็น array');
  report();
}

const seenDomainIds = new Set();
for (const d of domains) {
  const where = `domains.json (domain ${d.id})`;
  if (typeof d.id !== 'number') err(where, 'id ต้องเป็นตัวเลข');
  if (seenDomainIds.has(d.id)) err(where, 'id ซ้ำ');
  seenDomainIds.add(d.id);
  if (!d.file) err(where, 'ไม่ได้ระบุ file');
  if (!d.name || !d.name.en) err(where, 'name.en ว่าง');
  else if (!d.name.th) warn(where, 'name.th ว่าง');
}

/* ─── คลังข้อสอบแต่ละโดเมน ─── */
const allIds = new Map(); // id → ไฟล์ที่พบครั้งแรก
let totalQuestions = 0;
let thComplete = 0;

for (const d of domains) {
  if (!d.file) continue;
  const file = readJson(d.file);
  if (!file) continue;

  if (file.domain !== undefined && Number(file.domain) !== Number(d.id)) {
    err(d.file, `ฟิลด์ domain ในไฟล์คือ ${file.domain} แต่ domains.json บอกว่าเป็น ${d.id}`);
  }

  const questions = file.questions;
  if (!Array.isArray(questions)) {
    err(d.file, 'ต้องมีฟิลด์ questions เป็น array');
    continue;
  }
  if (questions.length === 0) warn(d.file, 'ไม่มีโจทย์เลยในไฟล์นี้');

  questions.forEach((q, i) => {
    const where = `${d.file} [${q.id || '#' + (i + 1)}]`;
    totalQuestions++;

    if (!q.id) err(where, 'ไม่มี id');
    else if (allIds.has(q.id)) err(where, `id ซ้ำกับที่อยู่ใน ${allIds.get(q.id)}`);
    else allIds.set(q.id, d.file);

    if (!q.q || !String(q.q.en || '').trim()) err(where, 'q.en ว่าง');
    const qThOk = !!(q.q && String(q.q.th || '').trim());
    if (!qThOk) warn(where, 'ไม่มีคำแปลไทยของคำถาม');

    const choices = Array.isArray(q.choices) ? q.choices : [];
    if (choices.length < 2) err(where, `มีตัวเลือก ${choices.length} ข้อ ต้องมีอย่างน้อย 2`);

    const keys = new Set();
    let choicesThOk = choices.length > 0;
    for (const c of choices) {
      const k = String(c.k || '').toUpperCase();
      if (!k) err(where, 'ตัวเลือกไม่มีฟิลด์ k');
      if (keys.has(k)) err(where, `ตัวเลือก ${k} ซ้ำ`);
      keys.add(k);
      if (!String(c.en || '').trim() && !String(c.th || '').trim()) err(where, `ตัวเลือก ${k} ไม่มีข้อความ`);
      if (!String(c.th || '').trim()) choicesThOk = false;
    }

    const answer = Array.isArray(q.answer) ? q.answer : q.answer ? [q.answer] : [];
    if (!answer.length) err(where, 'ไม่มีเฉลย (answer)');
    for (const a of answer) {
      if (!keys.has(String(a).toUpperCase())) err(where, `เฉลย "${a}" ไม่ตรงกับตัวเลือกใดในข้อนี้`);
    }

    if (q.type === 'single' && answer.length > 1) err(where, 'type เป็น single แต่มีเฉลยมากกว่าหนึ่งตัว');
    if (q.type === 'multi' && answer.length === 1) warn(where, 'type เป็น multi แต่มีเฉลยตัวเดียว');

    if (!q.explain || !String(q.explain.en || '').trim()) warn(where, 'ไม่มีคำอธิบายภาษาอังกฤษ');
    else if (!String(q.explain.th || '').trim()) warn(where, 'ไม่มีคำอธิบายภาษาไทย');

    if (qThOk && choicesThOk) thComplete++;
  });
}

/* ─── ไฟล์รหัสเข้าใช้งาน (คนทำข้อสอบ + admin) ─── */
function checkCodesFile(filename) {
  if (!existsSync(join(DATA, filename))) return;
  const codes = readJson(filename);
  if (!codes) return;

  if (!codes.salt) err(filename, 'ไม่มี salt');
  if (!Array.isArray(codes.codes)) {
    err(filename, 'codes ต้องเป็น array');
    return;
  }
  if (codes.codes.length === 0) warn(filename, 'ยังไม่มีรหัสเลย — จะไม่มีใครเข้าใช้งานได้');
  for (const c of codes.codes) {
    if (!c.h || !/^[0-9a-f]{64}$/.test(c.h)) err(filename, 'พบรายการที่ hash ไม่ถูกรูปแบบ');
    if (/^[A-Z0-9-]{3,}$/i.test(String(c.label || '')) && !String(c.label).includes('*')) {
      warn(filename, `label "${c.label}" ดูเหมือนรหัสเต็ม ควรเก็บเป็นรูปย่อเท่านั้น`);
    }
  }
}

checkCodesFile('codes.json');
checkCodesFile('admin-codes.json');
if (!existsSync(join(DATA, 'admin-codes.json'))) {
  warn('admin-codes.json', 'ยังไม่มีไฟล์นี้ — tools/import.html และ tools/editor.html จะเปิดใช้งานไม่ได้เลย จนกว่าจะรัน node tools/make-codes.mjs --file admin-codes.json --add "..."');
}

report();

function report() {
  const line = '─'.repeat(58);
  console.log(line);
  console.log(`โจทย์ทั้งหมด ${totalQuestions} ข้อ ใน ${domains.length} โดเมน`);
  console.log(`แปลไทยครบทั้งคำถามและตัวเลือก ${thComplete}/${totalQuestions} ข้อ`);
  console.log(line);

  if (warnings.length) {
    console.log(`\ncaution  คำเตือน ${warnings.length} รายการ`);
    for (const w of warnings.slice(0, 60)) console.log('  - ' + w);
    if (warnings.length > 60) console.log(`  … และอีก ${warnings.length - 60} รายการ`);
  }

  if (errors.length) {
    console.log(`\nERROR  ข้อผิดพลาด ${errors.length} รายการ`);
    for (const e of errors) console.log('  x ' + e);
    console.log('\nแก้ข้อผิดพลาดข้างต้นก่อน commit');
    process.exit(1);
  }

  console.log('\nOK  ไม่พบข้อผิดพลาด');
  process.exit(0);
}
