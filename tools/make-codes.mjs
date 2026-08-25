#!/usr/bin/env node
/**
 * make-codes.mjs — สร้าง/อัปเดตไฟล์ data/codes.json สำหรับระบบรหัสเข้าใช้งาน (ระดับ 1)
 *
 * รหัสจะถูกเก็บเป็น PBKDF2-SHA256 hash ไม่ใช่ข้อความดิบ
 * ค่าที่ใช้ต้องตรงกับฝั่งเบราว์เซอร์ใน assets/auth.js เป๊ะ ๆ
 *
 * วิธีใช้:
 *   node tools/make-codes.mjs --add "CISSP-2026"                       # รหัสกลาง (ผู้ใช้พิมพ์ชื่อเอง)
 *   node tools/make-codes.mjs --add "CISSP-7K2M:สมชาย"                 # รหัสรายคน (ล็อกชื่อ)
 *   node tools/make-codes.mjs --add "A:ชื่อ" --add "B:อีกชื่อ"          # เพิ่มหลายรหัสพร้อมกัน
 *   node tools/make-codes.mjs --add "X" --expires 2026-12-31 --max 50  # ตั้งวันหมดอายุ / จำนวนครั้งสูงสุด
 *   node tools/make-codes.mjs --list                                    # ดูรหัสที่มีอยู่ (เห็นเฉพาะ label)
 *   node tools/make-codes.mjs --reset                                   # ล้างทั้งไฟล์แล้วเริ่มใหม่ (เปลี่ยน salt)
 *
 * หมายเหตุ: เมื่อ --reset จะได้ salt ใหม่ รหัสเดิมทั้งหมดจะใช้ไม่ได้ทันที
 */

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'codes.json');

const ITERATIONS = 150000;
const KEYLEN = 32;
const DIGEST = 'sha256';

/** ทำให้รหัสเป็นรูปแบบมาตรฐานก่อนแฮช — ต้องตรงกับ normalizeCode() ใน assets/auth.js */
export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function hashCode(code, saltHex) {
  return pbkdf2Sync(
    normalizeCode(code),
    Buffer.from(saltHex, 'hex'),
    ITERATIONS,
    KEYLEN,
    DIGEST
  ).toString('hex');
}

function parseArgs(argv) {
  const out = { add: [], list: false, reset: false, expires: '', max: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--add') out.add.push(argv[++i]);
    else if (a === '--list') out.list = true;
    else if (a === '--reset') out.reset = true;
    else if (a === '--expires') out.expires = argv[++i] || '';
    else if (a === '--max') out.max = Number(argv[++i]) || null;
  }
  return out;
}

function emptyFile() {
  return {
    schemaVersion: 1,
    salt: randomBytes(16).toString('hex'),
    iterations: ITERATIONS,
    codes: []
  };
}

function load() {
  if (!existsSync(FILE)) return emptyFile();
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    if (!data.salt || !Array.isArray(data.codes)) return emptyFile();
    return data;
  } catch {
    return emptyFile();
  }
}

const args = parseArgs(process.argv.slice(2));
let db = args.reset ? emptyFile() : load();

if (args.list) {
  if (db.codes.length === 0) {
    console.log('ยังไม่มีรหัสในไฟล์');
  } else {
    console.log(`รหัสทั้งหมด ${db.codes.length} รายการ (salt: ${db.salt.slice(0, 8)}…)`);
    for (const c of db.codes) {
      const who = c.name ? `รายคน → ${c.name}` : 'รหัสกลาง (พิมพ์ชื่อเอง)';
      const exp = c.expires ? ` หมดอายุ ${c.expires}` : '';
      const max = c.maxUses ? ` สูงสุด ${c.maxUses} ครั้ง` : '';
      console.log(`  • ${c.label.padEnd(16)} ${c.active ? 'ใช้งานได้' : 'ปิดอยู่  '}  ${who}${exp}${max}`);
    }
  }
  process.exit(0);
}

if (args.add.length === 0 && !args.reset) {
  console.log('ไม่ได้ระบุ --add จึงไม่มีอะไรเปลี่ยนแปลง (ใช้ --list เพื่อดูรายการ)');
  process.exit(0);
}

let added = 0;
for (const entry of args.add) {
  const [rawCode, ...nameParts] = String(entry).split(':');
  const code = normalizeCode(rawCode);
  if (!code) continue;

  const name = nameParts.join(':').trim();
  const h = hashCode(code, db.salt);

  if (db.codes.some((c) => c.h === h)) {
    console.log(`  ข้าม ${code} — มีอยู่แล้ว`);
    continue;
  }

  db.codes.push({
    h,
    // label เอาไว้ให้เจ้าของจำได้ว่ารหัสไหนเป็นรหัสไหน โดยไม่เปิดเผยรหัสเต็ม
    label: code.length <= 4 ? code[0] + '***' : code.slice(0, 4) + '****',
    name,
    active: true,
    expires: args.expires || '',
    maxUses: args.max
  });
  added++;
  console.log(`  + ${code}  ${name ? `→ ${name}` : '(รหัสกลาง)'}`);
}

writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
console.log(`\nบันทึกแล้ว: data/codes.json (เพิ่ม ${added} รายการ, รวมทั้งหมด ${db.codes.length})`);
if (args.reset) console.log('salt ถูกเปลี่ยนใหม่ — รหัสเก่าทั้งหมดใช้ไม่ได้แล้ว');
