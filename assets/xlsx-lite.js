/**
 * xlsx-lite.js — อ่านไฟล์ .xlsx ในเบราว์เซอร์โดยไม่พึ่ง library ภายนอก
 *
 * .xlsx คือไฟล์ ZIP ที่ข้างในเป็น XML เราจึงทำแค่สองอย่าง:
 *   1. แกะ ZIP เอง (อ่าน central directory แล้วคลายบีบอัดด้วย DecompressionStream ของเบราว์เซอร์)
 *   2. แปลง XML ของ worksheet เป็นตาราง 2 มิติ
 *
 * ที่ไม่ใช้ SheetJS เพราะไม่อยากผูกกับ CDN และไม่อยากฝากไฟล์ก้อนใหญ่ไว้ใน repo
 * ข้อแลกคือรองรับเฉพาะสิ่งที่จำเป็น: ข้อความ ตัวเลข และ shared strings เท่านั้น
 *
 * ต้องการ DecompressionStream ซึ่งมีใน Chrome 80+, Edge 80+, Firefox 113+, Safari 16.4+
 * ถ้าเบราว์เซอร์เก่ากว่านั้น ให้ผู้ใช้ก๊อปข้อมูลจาก Excel มาวางเป็น TSV แทน
 */
(function () {
  const SIG_EOCD = 0x06054b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;

  function supported() {
    return typeof DecompressionStream === 'function';
  }

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** แกะ ZIP เป็น { ชื่อไฟล์: Uint8Array } */
  async function unzip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // หา End Of Central Directory จากท้ายไฟล์
    let eocd = -1;
    const minStart = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minStart; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx ที่อ่านได้ (ไม่พบโครงสร้าง ZIP)');

    const entryCount = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);

    const files = {};
    const decoder = new TextDecoder('utf-8');

    for (let n = 0; n < entryCount; n++) {
      if (view.getUint32(ptr, true) !== SIG_CEN) break;

      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

      if (view.getUint32(localOffset, true) === SIG_LOC) {
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const raw = bytes.subarray(start, start + compSize);

        if (method === 0) files[name] = raw.slice();
        else if (method === 8) {
          if (!supported()) throw new Error('เบราว์เซอร์นี้คลายบีบอัด .xlsx ไม่ได้ — ใช้วิธีก๊อปจาก Excel มาวางแทน');
          files[name] = await inflateRaw(raw);
        }
      }

      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function textOf(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  function parseXml(str) {
    const doc = new DOMParser().parseFromString(str, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('อ่านโครงสร้าง XML ในไฟล์ไม่สำเร็จ');
    return doc;
  }

  /** แปลง "BC" เป็นเลขคอลัมน์ฐาน 0 */
  function colIndex(ref) {
    const letters = String(ref).match(/^[A-Z]+/i);
    if (!letters) return 0;
    let n = 0;
    for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function readSharedStrings(files) {
    const raw = files['xl/sharedStrings.xml'];
    if (!raw) return [];
    const doc = parseXml(textOf(raw));
    return Array.from(doc.getElementsByTagName('si')).map((si) =>
      Array.from(si.getElementsByTagName('t'))
        .map((t) => t.textContent)
        .join('')
    );
  }

  /** อ่านชื่อชีตทั้งหมดพร้อมพาธไฟล์จริง โดยไล่ตาม relationship */
  function readSheetIndex(files) {
    const wb = parseXml(textOf(files['xl/workbook.xml']));
    const relsRaw = files['xl/_rels/workbook.xml.rels'];
    const relMap = {};
    if (relsRaw) {
      const rels = parseXml(textOf(relsRaw));
      for (const r of rels.getElementsByTagName('Relationship')) {
        let target = r.getAttribute('Target') || '';
        if (target.startsWith('/xl/')) target = target.slice(1);
        else if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
        relMap[r.getAttribute('Id')] = target;
      }
    }

    return Array.from(wb.getElementsByTagName('sheet')).map((s, i) => {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      return {
        name: s.getAttribute('name') || `Sheet${i + 1}`,
        path: relMap[rid] || `xl/worksheets/sheet${i + 1}.xml`
      };
    });
  }

  function readSheet(files, path, shared) {
    const raw = files[path];
    if (!raw) return [];
    const doc = parseXml(textOf(raw));
    const rows = [];

    for (const row of doc.getElementsByTagName('row')) {
      const out = [];
      for (const c of row.getElementsByTagName('c')) {
        const idx = colIndex(c.getAttribute('r') || '');
        const type = c.getAttribute('t');
        let value = '';

        if (type === 'inlineStr') {
          value = Array.from(c.getElementsByTagName('t'))
            .map((t) => t.textContent)
            .join('');
        } else {
          const v = c.getElementsByTagName('v')[0];
          const text = v ? v.textContent : '';
          if (type === 's') value = shared[Number(text)] ?? '';
          else if (type === 'b') value = text === '1' ? 'TRUE' : 'FALSE';
          else value = text;
        }

        while (out.length < idx) out.push('');
        out[idx] = String(value);
      }
      rows.push(out);
    }

    // ตัดแถวว่างท้ายตารางทิ้ง
    while (rows.length && rows[rows.length - 1].every((c) => !String(c).trim())) rows.pop();
    return rows;
  }

  /**
   * อ่านไฟล์ .xlsx เป็น { sheets: [{name, rows}] }
   * @param {ArrayBuffer} buffer
   */
  async function read(buffer) {
    const files = await unzip(buffer);
    if (!files['xl/workbook.xml']) throw new Error('ไม่พบ xl/workbook.xml — ไฟล์อาจไม่ใช่ .xlsx');

    const shared = readSharedStrings(files);
    return {
      sheets: readSheetIndex(files).map((s) => ({ name: s.name, rows: readSheet(files, s.path, shared) }))
    };
  }

  window.XlsxLite = { read, supported };
})();
