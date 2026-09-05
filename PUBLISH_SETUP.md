# ตั้งค่า "เผยแพร่ขึ้นเว็บเลย" (เผยแพร่โจทย์เข้า GitHub โดยตรง)

ทำครั้งเดียวโดยเจ้าของระบบ ใช้เวลาประมาณ 10 นาที **ไม่ทำก็ได้** — ถ้าไม่ทำ `tools/import.html`
ยังใช้งานได้ปกติทุกอย่าง แค่ปุ่ม "🚀 เผยแพร่ทั้งหมดขึ้นเว็บเลย" จะกดแล้วขึ้น error บอกว่ายังไม่ได้ตั้งค่า
คุณยังดาวน์โหลด JSON ไปวางใน `data/` เองแบบเดิมได้เสมอ

**ต้องทำ [SHEETS_SETUP.md](SHEETS_SETUP.md) ให้เสร็จก่อน** — ฟีเจอร์นี้ใช้ Apps Script ตัวเดียวกับที่เก็บประวัติ
แค่เพิ่ม action ใหม่เข้าไป ไม่ได้สร้างเซิร์ฟเวอร์ใหม่

---

## หลักการทำงาน (อ่านก่อนตั้งค่า)

`tools/import.html` เป็นหน้าเว็บล้วน ๆ ไม่มีสิทธิ์เขียนเข้า GitHub เอง
เมื่อกดปุ่มเผยแพร่ มันจะส่งไฟล์ JSON ที่ตรวจผ่านแล้วไปให้ **Apps Script** (ซึ่งถือ GitHub token
ไว้ฝั่งเซิร์ฟเวอร์ ไม่เคยส่งมาที่เบราว์เซอร์เลย) เป็นคนเขียนไฟล์เข้า repo ให้แทน ผ่าน GitHub Contents API
ตรงเข้า branch `main` ทันที (ไม่ผ่าน Pull Request)

การเขียนเข้า repo เป็นการกระทำที่เสี่ยงกว่าอย่างอื่นในระบบนี้มาก จึงกันด้วยคีย์แยกต่างหาก
เรียกว่า **publishKey** — คนละอันกับรหัส admin ที่ใช้เปิดหน้า `import.html`/`editor.html`
และ **ปิดไว้เป็นค่าเริ่มต้น** (ต้องตั้งค่าให้ครบทั้งหมดก่อนถึงจะใช้ได้ ต่างจากคีย์อื่นในระบบที่ถ้าลืมตั้งจะปล่อยผ่าน)

---

## ขั้นตอน

### 1. สร้าง GitHub token แบบ fine-grained

ไปที่ [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)

| ช่อง | ค่าที่ต้องตั้ง |
|---|---|
| Token name | อะไรก็ได้ เช่น `practiceproject-publish` |
| Expiration | ตั้งวันหมดอายุ (แนะนำ 90 วัน แล้วค่อยสร้างใหม่) — **อย่าเลือก No expiration** |
| Repository access | **Only select repositories** → เลือกเฉพาะ repo นี้ |
| Permissions | Repository permissions → **Contents: Read and write** เท่านั้น ที่เหลือปล่อย No access |

กด **Generate token** แล้วก๊อปค่าที่ขึ้นต้นด้วย `github_pat_...` เก็บไว้ — GitHub จะโชว์ให้เห็นครั้งเดียว

> ยิ่ง scope แคบเท่าไหร่ยิ่งดี ถ้า token นี้หลุดไป attacker จะเขียนได้แค่ repo นี้ repo เดียว
> และแค่ไฟล์เนื้อหา (Contents) เท่านั้น แก้ settings/collaborators/repo อื่นไม่ได้

### 2. ใส่ token ลง Apps Script (ไม่ใช่ลงโค้ด)

ในหน้า Apps Script (Extensions → Apps Script จากสเปรดชีตเดิม) ไปที่ไอคอนเฟือง **Project Settings**
เลื่อนลงมาที่ **Script Properties** → **Add script property**

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | ค่า `github_pat_...` จากขั้นตอนที่ 1 |

กด **Save script properties**

Script Properties เป็นที่เก็บที่ **ไม่ได้อยู่ในสเปรดชีต** และไม่ถูก commit ไปไหน ปลอดภัยกว่าเก็บในโค้ดหรือในชีต

### 3. วางโค้ด Code.gs เวอร์ชันล่าสุดทับ (ถ้ายังไม่ได้ทำ)

กลับไปที่ไฟล์ `Code.gs` ในหน้า Apps Script ลบโค้ดเดิมทิ้งแล้ววางเนื้อหาจาก
[`apps-script/Code.gs`](apps-script/Code.gs) ของ repo นี้ลงไปแทนทั้งหมด (เวอร์ชันนี้มี action `publish` เพิ่มมาแล้ว)
กด **Save**

### 4. รัน `setup` อีกครั้ง

เลือกฟังก์ชัน **setup** แล้วกด **Run** เหมือนตอนติดตั้งครั้งแรก (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
ครั้งนี้จะสร้างแถวใหม่ในแท็บ `Meta`: `publishKey`, `githubOwner`, `githubRepo`, `githubBranch`

### 5. กรอกชื่อ repo ในแท็บ Meta

เปิดสเปรดชีต ไปที่แท็บ **Meta** แก้ค่าในแถวเหล่านี้:

| key | value ที่ต้องกรอก |
|---|---|
| `githubOwner` | ชื่อบัญชี/องค์กร GitHub เช่น `pornpanit171` |
| `githubRepo` | ชื่อ repo เช่น `PracticeProject` |
| `githubBranch` | เว้นไว้เป็น `main` ถ้าใช้ branch อื่นค่อยเปลี่ยน |

แก้ในสเปรดชีตได้ตรง ๆ ไม่ต้องแตะโค้ด มีผลทันที

### 6. Deploy เวอร์ชันใหม่

**Deploy → Manage deployments** → กดไอคอนดินสอที่ deployment เดิม → Version: **New version** → **Deploy**

> สำคัญ: การกด Save ใน Apps Script ไม่ทำให้ Web App ที่ deploy ไว้แล้วเปลี่ยนตาม
> ต้องกด New version ทุกครั้งที่แก้ Code.gs ไม่งั้นปุ่มเผยแพร่จะยังเจอ action `publish` ไม่รู้จัก (`unknownaction`)

### 7. ก๊อป publishKey

กลับไปที่แท็บ **Meta** ก๊อปค่าในแถว `publishKey` เก็บไว้ (ไม่ต้องใส่ไฟล์ไหนใน repo)

### 8. ทดสอบ

เปิด `tools/import.html` บนเว็บจริง → ปลดล็อกด้วยรหัส admin → นำเข้าโจทย์สักไฟล์เล็ก ๆ จนผ่านการตรวจ
กด **🚀 เผยแพร่ทั้งหมดขึ้นเว็บเลย** → ครั้งแรกจะมีกล่องเด้งถามหา publishKey → วางค่าจากขั้นตอนที่ 7

ถ้าสำเร็จจะขึ้นข้อความสีเขียว "เผยแพร่สำเร็จ N ไฟล์" — เปิด repo บน GitHub เช็คว่ามี commit ใหม่จริง
รอ 1-2 นาทีให้ GitHub Pages build เสร็จ แล้วเปิดเว็บจริงเช็คว่าโจทย์ใหม่ขึ้นแล้ว

---

## เรื่องที่ควรรู้

**publishKey ต่างจาก sheetsKey** — sheetsKey ฝังอยู่ใน `assets/config.js` ที่เป็นไฟล์สาธารณะ (ใครก็อ่านได้)
ส่วน publishKey **ห้ามใส่ในไฟล์ใด ๆ ที่ commit เข้า repo เด็ดขาด** เพราะเทียบเท่าสิทธิ์เขียนไฟล์เข้าเว็บได้จริง
ระบบจึงให้กรอกผ่านกล่องเด้งแล้วจำไว้ใน `localStorage` ของเบราว์เซอร์เครื่องนั้นเท่านั้น

**หมุนเวียน (rotate) publishKey ได้ทันทีโดยไม่ต้อง deploy ใหม่** — แก้ค่าตรงแถว `publishKey`
ในแท็บ Meta ของสเปรดชีตได้เลย เพราะระบบอ่านค่าจากชีตสดทุกครั้งที่มีการเผยแพร่
ล้างคีย์เก่าที่จำไว้ในเบราว์เซอร์ด้วยปุ่ม "ล้างคีย์เผยแพร่ที่จำไว้" ใน import.html

**ถ้า token หลุดหรือมีคนเผยแพร่มั่ว** ทางที่เร็วที่สุดคือ:
1. เปลี่ยนค่า `publishKey` ในแท็บ Meta ทันที (กันคนที่รู้ publishKey เดิมเผยแพร่ต่อ)
2. ถ้าสงสัยว่า token เองหลุด ไปที่ [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) แล้วกด **Delete** token นั้นทันที (ตัดสิทธิ์เขียนเข้า repo ทันที ไม่ต้องรอ)
3. ตรวจ commit history ของ repo ว่ามีอะไรผิดปกติไหม แล้ว revert ได้ตามปกติด้วย `git revert`

**เผยแพร่ตรงเข้า `main` ทันที ไม่มีขั้นตอนตรวจก่อน** — ตามที่ตั้งค่าไว้ พลาดพิมพ์ผิดจะขึ้นเว็บจริงทันที
ตรวจดูตารางพรีวิวในขั้นตอนที่ 3 ของ import.html ให้ดีก่อนกดเผยแพร่เสมอ
(ถ้าอยากเปลี่ยนเป็นเผยแพร่ผ่าน Pull Request ให้ตรวจก่อนในอนาคต แจ้งได้ ปรับเพิ่มทีหลังได้โดยไม่กระทบของเดิม)

**โควตา GitHub API** — token แบบ fine-grained ใช้โควตาร่วมกับบัญชีคุณ (5,000 request/ชั่วโมง)
การเผยแพร่หนึ่งครั้งใช้ไม่กี่ request ต่อไฟล์ ไม่มีทางชนโควตาในการใช้งานจริง
