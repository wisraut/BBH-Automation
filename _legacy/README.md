# _legacy/

ไฟล์ที่ archive จาก root ของ repo ใน restructure 2026-06-17 — ทั้งหมดเป็นของ **flow เก่าก่อน pivot เป็น BBH n8n Bot** (LINE doctor flow + Gmail polling + PostgreSQL hospital_db)

**ห้าม:**
- import จาก active code
- รัน script เหล่านี้ตรงๆ (จะพังเพราะ PostgreSQL container อาจไม่มีแล้ว)
- ลบทิ้ง — เก็บไว้สำหรับอ้างอิงประวัติศาสตร์ + กู้ข้อมูลเก่า

## ไฟล์

| ไฟล์ | สิ่งที่เป็น |
|------|-----------|
| `reset_nipa.py` | reset PostgreSQL hospital_db tables (doctor/patient/reports flow) |
| `test_fixes.py` | unit test สำหรับ `_get_db()` + race condition ใน doctor registration เดิม |
| `test_pipeline.py` | end-to-end test สำหรับ email→Dify pipeline เดิม |
| `update_dify_flow.py` | ฉีด workflow graph เก่าให้ Dify doctor-summary app |
| `hospital_db_backup.sql` | PostgreSQL backup ของ hospital_db ก่อนพิวอต |
| `setup_guide.md` | setup doc ของ flow เก่า (PostgreSQL + LINE doctor flow) |
| `Setup.md` | setup doc ภาษาไทย ของ flow เก่า |
| `setup.bat` / `setup.ps1` | Windows installer ของ flow เก่า |
| `start.bat` | startup script ของ flow เก่า |
