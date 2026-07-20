# Daily Report Pelaksana Project

Web app berbasis Google Apps Script untuk laporan harian lapangan konstruksi. Pelaksana mengisi form, admin approve, email otomatis terkirim ke stakeholder.

## Live Deployment

- **Form Input:** `https://script.google.com/macros/s/[DEPLOY_ID]/exec?page=form`
- **Admin Dashboard:** `https://script.google.com/macros/s/[DEPLOY_ID]/exec?page=admin`

## Fitur

### Form Input (Pelaksana)
- Section/area picker (Tower A, Tower B, dll)
- Dynamic kegiatan dengan progress % per item
- Dynamic kendala list
- Upload foto dokumentasi (multi-file)
- Auto-generate Report ID
- Header banner kustom dari admin

### Dashboard Admin
- Login berbasis email (multi-admin)
- Statistik real-time (total, menunggu, approved, ditolak) — auto-refresh 15 detik
- Filter by section, tanggal, status
- Approve/reject laporan dengan catatan
- Email notifikasi otomatis ke semua admin saat laporan baru masuk
- Email stakeholder otomatis saat approve

### Pengaturan (Admin)
- Header title form input
- Banner header image (upload ke Google Drive)
- Kelola admin emails (chip/tag UI, multi-admin)
- Kelola stakeholder emails (multi-stakeholder)
- Kelola sections/area

## Arsitektur

```
Google Apps Script Web App
├── Code.gs          — Backend: 15+ fungsi (submit, approve, email, upload, debug)
├── Index.html       — Form input pelaksana (responsive, mobile-first)
└── Admin.html       — Dashboard admin (login, stats, reports, settings, debug)
```

### 3 Sheet di Google Spreadsheet

| Sheet | Fungsi |
|-------|--------|
| **Settings** | Konfigurasi: nama proyek, header title, admin emails, stakeholder emails, banner URL, sections |
| **Reports** | Data laporan harian: ID, timestamp, section, tanggal, pelapor, cuaca, tenaga kerja, alat berat, kendala, link foto, status, catatan admin, approver, waktu approval |
| **WorkItems** | Detail kegiatan per laporan: report ID, no, nama kegiatan, progress %, keterangan |

### Flow

```
Pelaksana submit → Status: "Menunggu Approval"
     ↓
Email notifikasi ke semua admin
     ↓
Admin buka dashboard → auto-refresh 15 detik → approve/reject
     ↓ (jika approve)
Email ke semua stakeholder + status: "Approved"
```

## Setup

### 1. Buat Google Spreadsheet baru
- Buka [sheets.google.com](https://sheets.google.com) → Blank spreadsheet
- Rename sesuai nama proyek

### 2. Buat Apps Script
- Di spreadsheet: **Extensions > Apps Script**
- Copy isi `Code.gs` ke file `Code.gs`
- Buat file baru `Index.html` → copy isi dari repo ini
- Buat file baru `Admin.html` → copy isi dari repo ini

### 3. Jalankan Setup
- Di Apps Script editor, pilih fungsi `setupSpreadsheet` → Run
- Ini akan otomatis membuat 3 sheet (Settings, Reports, WorkItems) beserta header-nya

### 4. Deploy
- **Deploy > New deployment > Web app**
- Execute as: **Me**
- Who has access: **Anyone**
- Klik Deploy → copy URL

### 5. Konfigurasi
- Buka `?page=admin` → tab Pengaturan
- Isi nama proyek, header title
- Tambah admin emails (bisa lebih dari 1)
- Tambah stakeholder emails
- Upload banner header (opsional)
- Kelola sections/area

## Endpoints

| URL Parameter | Halaman | Fungsi |
|---------------|---------|--------|
| `?page=form` | Form Input | Pelaksana isi laporan |
| `?page=admin` | Dashboard Admin | Login, lihat stats, approve/reject, settings |

## Backend Functions (Code.gs)

| Fungsi | Deskripsi |
|--------|-----------|
| `doGet(e)` | Route ke form atau admin berdasarkan parameter `page` |
| `getSettings()` | Ambil semua pengaturan dari sheet Settings |
| `submitReport(formData)` | Simpan laporan baru + upload foto + notifikasi admin |
| `notifyAdmin(settings, reportId, formData)` | Kirim email ke semua admin email |
| `uploadPhotosToDrive(fotos, section, tanggal)` | Upload foto ke Google Drive, return link folder |
| `getReports(filter)` | Ambil laporan dengan filter section/tanggal/status (auto-detect column) |
| `approveReport(reportId, approverEmail)` | Approve laporan + kirim email stakeholder |
| `rejectReport(reportId, catatan)` | Tolak laporan dengan catatan |
| `sendApprovedEmail(reportId, row, colMap, approverEmail)` | Email HTML ke stakeholder setelah approve |
| `getDashboardStats()` | Statistik dashboard (total, pending, approved, rejected per section) |
| `isAdmin(email)` | Cek apakah email terdaftar sebagai admin |
| `addSection(name)` / `deleteSection(name)` | Kelola sections |
| `updateSettings(data)` | Simpan pengaturan |
| `getReportsColumnMap(sheet)` | Auto-detect kolom dari header (backward compatible) |
| `migrateReportsSheet()` | Fix sheet lama (tambah kolom Kendala jika belum ada) |
| `uploadBannerImage(base64, fileName, mimeType)` | Upload banner ke Google Drive |
| `getDebugInfo()` | Info debug untuk troubleshooting |
| `setupSpreadsheet()` | Inisialisasi spreadsheet (jalankan sekali) |

## Known Issues

- Banner upload: base64 via `google.script.run` punya payload limit ~50KB. Gambar besar perlu dikompres dulu atau upload manual ke Google Drive lalu paste URL.
- `google.script.run` tidak support real-time push — dashboard auto-refresh setiap 15 detik.
- MailApp quota: 100 email/hari (akun biasa), 1500/hari (Google Workspace).

## Tech Stack

- **Backend:** Google Apps Script (JavaScript)
- **Frontend:** HTML Service + CSS3 + vanilla JavaScript
- **Database:** Google Spreadsheet
- **Storage:** Google Drive (foto dokumentasi + banner)
- **Email:** MailApp (Gmail/Workspace)
- **Icons:** Font Awesome 6.4.0

## License

Private project.
