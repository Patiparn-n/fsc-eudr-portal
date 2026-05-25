# 🌳 FSC & EUDR Compliance Portal

ระบบติดตามตรวจสอบความสอดคล้องด้าน **FSC Controlled Wood** และ **กฎระเบียบ EUDR** (EU Deforestation Regulation 2023/1115)  
สำหรับผู้ประกอบการไม้ยูคาลิปตัสและพืชป่าเศรษฐกิจในประเทศไทย

---

## ✨ ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---------|-----------|
| 📊 **Dashboard** | ภาพรวม KPI + แผนที่ Leaflet ตำแหน่งแปลงปลูกทั้งหมด |
| 🌱 **ฐานข้อมูลแปลงปลูก** | เพิ่ม/แก้ไข/ลบ พิกัด Point/Polygon, ค้นหา, กรองสถานะ, ส่งออก CSV |
| 🏆 **FM Certificate** | รองรับใบรับรอง FSC Forest Management → อ้างสิทธิ์ FSC 100% |
| 🚛 **CoC Ledger** | บันทึกการส่งมอบไม้ ติดตาม Chain of Custody, ค้นหา, ลบ, ส่งออก CSV |
| 📄 **DDS Report** | รายงาน Due Diligence Statement พร้อม GeoJSON สำหรับระบบ EU TRACES |
| 💾 **Backup / Restore** | สำรองข้อมูลทั้งหมดเป็น JSON / นำเข้าข้อมูลคืน |
| 📱 **Mobile Responsive** | รองรับการใช้งานบน Tablet/มือถือ |
| 🖨️ **พิมพ์รายงาน** | Print CSS ที่ปรับแต่งสำหรับเอกสาร DDS แบบ A4 |

---

## 🚀 วิธี Deploy บน GitHub Pages

### ขั้นตอนที่ 1 — สร้าง Repository บน GitHub

1. ไปที่ [github.com/new](https://github.com/new)
2. ตั้งชื่อ Repository เช่น `fsc-eudr-portal`
3. เลือก **Public** (GitHub Pages ฟรีต้องเป็น Public)
4. **อย่า** เลือก Initialize repository
5. คลิก **Create repository**

### ขั้นตอนที่ 2 — Push โค้ดขึ้น GitHub

เปิด **PowerShell** หรือ **Terminal** ในโฟลเดอร์โปรเจกต์ แล้วรันคำสั่ง:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/fsc-eudr-portal.git
git push -u origin main
```

> แทน `YOUR_USERNAME` ด้วย GitHub username ของคุณ

### ขั้นตอนที่ 3 — เปิดใช้งาน GitHub Pages

1. ไปที่ Repository → **Settings** → **Pages**
2. ที่ **Source** เลือก **GitHub Actions**
3. คลิก **Save**

### ขั้นตอนที่ 4 — รอ Deploy อัตโนมัติ

GitHub Actions จะ Deploy ให้อัตโนมัติทุกครั้งที่ Push โค้ด  
ดูสถานะ Deploy ได้ที่แท็บ **Actions**

🌐 **URL ของแอปจะเป็น:**  
`https://YOUR_USERNAME.github.io/fsc-eudr-portal/`

---

## 💻 รันบนเครื่องตัวเอง (Local)

### วิธีที่ 1 — ดับเบิลคลิก `run.bat`
ไฟล์ `run.bat` จะเปิด Server และเปิด Browser ให้อัตโนมัติ

### วิธีที่ 2 — รัน PowerShell Script
```powershell
.\run_server.ps1
```
แอปจะเปิดที่ **http://localhost:8085/**

---

## 🏗️ สถาปัตยกรรม

```
FSC EUDR/
├── index.html          # จุดเริ่มต้นของแอป
├── app.js              # Logic หลัก + State Management (Preact)
├── components.js       # Components ทั้งหมด (Dashboard, Form, Map, Report)
├── style.css           # Design System + Responsive + Print CSS
├── .github/
│   └── workflows/
│       └── pages.yml   # GitHub Actions auto-deploy
└── run_server.ps1      # PowerShell local dev server
```

**Tech Stack:** Preact + HTM (ไม่ต้อง Build), Leaflet.js, Lucide Icons, localStorage

---

## 📋 มาตรฐานที่รองรับ

- **EUDR** — EU Regulation 2023/1115 (EU Deforestation Regulation)
- **FSC Controlled Wood** — FSC-STD-40-005 V3-1
- **FSC 100%** — รองรับผ่าน FM Certificate
- **GeoJSON** — RFC 7946 / EU TRACES compatible format
- **WGS 84** — ระบบพิกัดภูมิศาสตร์มาตรฐาน

---

## 📦 การสำรองข้อมูล

ข้อมูลทั้งหมดเก็บใน **Browser localStorage** ควรสำรองข้อมูลเป็น JSON สม่ำเสมอ:

1. คลิก **สำรองข้อมูล (.json)** ที่ด้านล่าง Sidebar
2. เก็บไฟล์ `.json` ไว้ในที่ปลอดภัย
3. หากต้องการนำเข้าคืน คลิก **นำเข้าข้อมูล (.json)**

> ⚠️ **ข้อควรระวัง:** การล้าง Browser Cache หรือเปลี่ยน Browser จะทำให้ข้อมูลหาย  
> ควร Export JSON สำรองก่อนทุกครั้ง

---

*พัฒนาสำหรับ SAAA — ระบบ FSC & EUDR Compliance Portal*
