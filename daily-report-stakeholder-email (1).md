# Project: Daily Report → Auto Email Stakeholder (Google Apps Script Web App)

## Latar Belakang

Masalah yang ingin diselesaikan (berdasarkan pengalaman langsung di lapangan):

1. **Project Control (PC) butuh informasi cepat dari site engineer/pelaksana lapangan** — saat ini prosesnya lambat dan tidak real-time.
2. **Laporan via WhatsApp membingungkan PC** — format bebas, tidak terstruktur, tercampur chat lain, sulit dicari kembali. Tidak ada standardisasi antara satu pelaksana dengan yang lain.
3. **Pelaksana lapangan butuh cara mengisi laporan yang mudah** — bukan proses ribet, minim ketik manual, bisa dikerjakan cepat dari HP di lapangan.
4. **PC/PM sering kehilangan record laporan harian** — tidak ada database terpusat, laporan lama hilang/tercampur di riwayat chat.

**Solusi:** web app berbasis Google Apps Script + Spreadsheet sebagai database, dengan form terstruktur (bukan free text seperti WA) dan auto-email ke stakeholder begitu laporan disubmit. Spreadsheet berfungsi sebagai arsip permanen — setiap submit otomatis jadi record baru yang tidak akan hilang.

**Keputusan desain:** dibangun terpisah dari tool lain (bukan reuse arsitektur Master/Template project sebelumnya). Scope sengaja dibuat kecil dan fokus.

## Alur Utama
1. Site engineer membuka web app (URL Apps Script), login otomatis via Google Account.
2. Site engineer mengisi form laporan harian dan submit.
3. Data tersimpan ke Google Spreadsheet dengan status "Menunggu Approval PC".
4. **Project Control (PC) mendapat notifikasi** (email) bahwa ada laporan baru masuk, berisi ringkasan data untuk direview.
5. PC membuka laporan (link menuju spreadsheet atau halaman review sederhana), cek kebenaran data, lalu **approve** (misal centang kolom "Approved" atau klik tombol approve di web app).
6. Setelah di-approve oleh PC, Apps Script otomatis generate email dan mengirimkannya ke PM, owner, dan stakeholder eksternal lain — jadi pihak eksternal hanya menerima laporan yang sudah bersih dan terverifikasi, tanpa typo atau kesalahan input.

**Catatan:** approval hanya di level PC (bukan PM). PM dan stakeholder eksternal posisinya sebagai penerima laporan jadi, bukan approver.

## Struktur Data (Spreadsheet)

### Sheet: `Reports`
Menyimpan semua laporan harian. Kolom:
| Kolom | Tipe | Keterangan |
|---|---|---|
| Timestamp | datetime | otomatis saat submit |
| Project ID | text | kode/nama proyek |
| Tanggal Laporan | date | tanggal aktivitas (bisa beda dari timestamp submit) |
| Nama Pelapor | text | site engineer yang submit |
| Progress Fisik (%) | number | progress kumulatif proyek |
| Cuaca | text | dropdown: Cerah / Hujan / Mendung / dst |
| Jumlah Tenaga Kerja | number | total pekerja hari itu |
| Alat Berat Digunakan | text | free text atau multi-select |
| Kegiatan Hari Ini | list of text | daftar kegiatan, tiap item 1 kalimat (disimpan sebagai teks dengan pemisah baris/numbering di dalam sel) |
| Kendala/Hambatan | list of text | daftar kendala, tiap item 1 kalimat, opsional (disimpan sebagai teks dengan pemisah baris/numbering di dalam sel) |
| Link Folder Foto Dokumentasi | url | link Google Drive folder berisi semua foto hari itu (mendukung banyak foto sekaligus) |
| Status | text | Menunggu Approval PC / Approved / Terkirim / Failed |
| Nama PC Approver | text | otomatis terisi saat PC approve |
| Waktu Approval | datetime | otomatis terisi saat PC approve |

### Sheet: `Projects`
Master daftar proyek dan stakeholder-nya. Kolom:
| Kolom | Tipe | Keterangan |
|---|---|---|
| Project ID | text | harus unik, dipakai sebagai key |
| Nama Proyek | text | nama lengkap proyek |
| Penanggung Jawab Pelaksana | text | nama site engineer/pelaksana yang bertanggung jawab submit laporan untuk proyek ini |
| Penanggung Jawab PC | text | nama PC yang bertanggung jawab approve laporan proyek ini |
| Email PC (Approver) | text | email PC yang bertugas approve laporan proyek ini (bisa lebih dari satu, dipisah koma) |
| Daftar Email Stakeholder (PM & Eksternal) | text | email dipisah koma — penerima laporan setelah di-approve PC |
| Aktif | boolean | TRUE/FALSE — kalau FALSE, email tidak dikirim (proyek sudah selesai/nonaktif) |

## Komponen Teknis

### 1. Web App Form (HTML Service)
- File: `Index.html` — form input laporan harian
- Dropdown "Project ID" diambil dinamis dari sheet `Projects` (hanya yang Aktif = TRUE)
- Input "Kegiatan Hari Ini" dan "Kendala/Hambatan" berbentuk **list dinamis per kalimat**, bukan 1 kolom paragraf panjang. Contoh UX:
  ```
  Kendala
  1. [input text] banyak telat          [hapus]
  2. [input text] material belum datang [hapus]
  + Tambahkan Kendala
  ```
  Tiap klik "+ Tambahkan" menambah 1 baris input baru. Sebelum disimpan ke sheet, semua item digabung jadi 1 teks dengan numbering (`1. ..., 2. ..., dst`) di dalam 1 sel, supaya tetap rapi dibaca di spreadsheet maupun email. Field "Kendala" boleh kosong (tidak wajib diisi kalau memang tidak ada kendala hari itu); field "Kegiatan" tetap wajib minimal 1 item.
- Upload foto: input file mendukung **multiple upload sekaligus** (`<input type="file" multiple>`). Semua foto disimpan ke `DriveApp` dengan struktur folder: `Project ID/Tanggal/` — sehingga pelaksana bisa kirim dokumentasi sebanyak apapun, dan hasilnya tetap 1 link folder yang tersimpan ke kolom "Link Folder Foto Dokumentasi"
- Perlu indikator loading saat upload berlangsung (terutama kalau banyak foto/resolusi besar), dan pertimbangkan kompresi di sisi client sebelum upload untuk foto beresolusi besar
- Validasi minimal: Project ID, Tanggal, Progress %, dan minimal 1 item Kegiatan Hari Ini wajib diisi sebelum submit

### 2. Apps Script Backend (`Code.gs`)
Fungsi-fungsi utama yang perlu dibuat:
- `doGet(e)` — serve halaman web app. Bisa serve 2 tampilan berbeda: form input (untuk site engineer) dan halaman review/approval (untuk PC), dibedakan lewat parameter URL (misal `?page=approval`)
- `getActiveProjects()` — ambil daftar project aktif untuk dropdown, dipanggil dari client-side via `google.script.run`
- `submitReport(formData)` — terima data dari form, simpan ke sheet `Reports` dengan status "Menunggu Approval PC", lalu panggil `notifyPC()`
- `notifyPC(reportData)` — kirim email notifikasi ke Email PC (dari sheet `Projects` sesuai Project ID) berisi ringkasan laporan dan link untuk review/approve
- `getPendingReports(pcEmail)` — ambil daftar laporan yang masih "Menunggu Approval PC" untuk PC tertentu, dipakai di halaman approval
- `approveReport(reportId, pcName)` — update status jadi "Approved", catat nama PC dan waktu approval, lalu panggil `sendStakeholderEmail()`
- `sendStakeholderEmail(reportData)` — generate isi email (HTML template) dan kirim via `MailApp.sendEmail()` ke Daftar Email Stakeholder (PM & Eksternal) dari sheet `Projects`, update status jadi "Terkirim"
- `uploadPhotos(fileBlobs[], projectId, tanggal)` — upload banyak foto sekaligus ke folder Drive `Project ID/Tanggal/` (buat folder otomatis kalau belum ada), return 1 URL folder

### 3. Format Email
- Subject: `Laporan Harian [Nama Proyek] - [Tanggal]`
- Body (HTML): ringkasan progress %, tenaga kerja, cuaca, kegiatan, kendala (jika ada), link foto dokumentasi
- Tidak perlu attachment PDF di versi awal (MVP) — cukup HTML body, bisa ditambah kemudian

## Batasan Teknis yang Perlu Diperhatikan
- **Quota `MailApp`**: 100 email/hari untuk akun Gmail biasa, 1500/hari untuk Google Workspace. Kalau jumlah proyek × jumlah stakeholder berpotensi melebihi ini, perlu strategi batching atau upgrade ke Workspace.
- **Batas eksekusi script**: 6 menit per eksekusi — untuk MVP dengan 1 laporan per submit, ini bukan masalah, tapi perlu diingat kalau nanti ada fitur bulk/batch.
- **Ukuran email HTML**: jangan embed foto langsung di body email (base64) karena bikin email berat — cukup sertakan link Google Drive.
- **Concurrent submission**: kalau banyak site engineer submit bersamaan, pertimbangkan `LockService` untuk mencegah race condition saat menulis ke sheet.
- **Upload multi-foto**: payload base64 dari browser ke server (`google.script.run`) punya overhead ukuran ~37% dan ada batas praktis per request — kalau foto banyak/resolusi besar, upload sebaiknya dilakukan bertahap (loop per file) bukan sekaligus dalam satu request, dan pertimbangkan kompresi di sisi client sebelum kirim.
- **Kuota Drive**: proyek jangka panjang dengan banyak foto tiap hari lama-lama menghabiskan storage — strategi archive/cleanup foto lama bisa dipikirkan belakangan kalau memang jadi masalah nyata.

## Kelebihan & Kekurangan Pendekatan Ini

**Kelebihan**
1. Cepat dibangun & murah — tidak perlu hosting/server terpisah, semua jalan di ekosistem Google.
2. Langsung menjawab 4 masalah utama: format terstandardisasi (bukan WA bebas format), notifikasi cepat, database terpusat (tidak hilang), form mudah diisi dari HP.
3. Tidak perlu training berat — pelaksana dan PC sudah familiar dengan ekosistem Google.
4. Data mentah selalu bisa diakses langsung dari spreadsheet oleh PC/PM.
5. Mudah dikembangkan bertahap — mulai dari MVP kecil, nambah fitur belakangan tanpa rombak total.
6. Dengan approval PC, stakeholder eksternal (PM, owner) hanya menerima laporan yang sudah diverifikasi — meminimalkan typo/kesalahan input sampai ke level atas.

**Kekurangan**
1. Skalabilitas terbatas — Spreadsheet mulai lambat kalau data sudah puluhan ribu baris.
2. Quota Google terbatas — `MailApp` 100 email/hari (akun biasa) atau 1500/hari (Workspace).
3. Ketergantungan pada 1 akun Google pemilik script — perlu strategi ownership/backup yang jelas.
4. Ada jeda waktu sebelum stakeholder menerima laporan (menunggu PC approve) — trade-off akurasi vs kecepatan penuh, tapi ini sudah jadi keputusan sadar demi kualitas data yang sampai ke eksternal.
5. UI/UX terbatas dibanding aplikasi native — cukup untuk kebutuhan sekarang, tapi kurang fleksibel untuk kebutuhan kompleks (misal offline mode di lokasi sinyal lemah).
6. Keamanan & akses kontrol sederhana — cocok skala tim kecil-menengah, kurang cocok kalau butuh role-based access yang rumit.
7. Kualitas data tetap bergantung pada input manual pelaksana — mitigasinya lewat validasi form yang baik (lihat bagian di bawah), bukan menghilangkan proses manualnya sepenuhnya.

## Mitigasi Human Error pada Input Manual
Karena progress % dan data lapangan lain diisi manual oleh pelaksana, beberapa langkah berikut membantu meminimalkan kesalahan dari sumbernya:
- **Dropdown/pilihan** untuk data dengan opsi terbatas (cuaca, jenis alat berat, kategori kendala) — hindari free text untuk data yang seharusnya seragam.
- **Validasi rentang angka** untuk Progress Fisik (%): harus 0-100, dan idealnya tidak boleh lebih kecil dari progress hari sebelumnya (validasi logis di script sebelum simpan).
- **Preview sebelum submit** — tampilkan ringkasan data dalam bentuk mudah dibaca, ada tombol konfirmasi sebelum benar-benar terkirim.
- **Field wajib minimal tapi jelas** — hindari terlalu banyak field wajib supaya pelaksana tidak buru-buru asal isi.
- **Tampilkan progress hari sebelumnya sebagai acuan** di form, supaya pelaksana punya konteks dan tidak salah input angka yang tidak masuk akal.
- **Auto-fill data yang berulang** (nama pelaksana, Project ID) dari sesi login, supaya tidak perlu ketik ulang tiap hari.
- Lapisan approval PC (lihat Alur Utama) menjadi filter terakhir sebelum data sampai ke PM/stakeholder eksternal.

## Rencana Pengerjaan (MVP dulu, bertahap)

### Tahap 1 — Setup dasar
- [ ] Buat Spreadsheet baru dengan sheet `Reports` dan `Projects`
- [ ] Isi data dummy di sheet `Projects` (2-3 proyek contoh + email stakeholder)
- [ ] Buat Apps Script project, hubungkan ke spreadsheet

### Tahap 2 — Web App form
- [ ] Buat `Index.html` dengan form sesuai kolom di sheet `Reports`
- [ ] Dropdown Project ID dinamis dari sheet `Projects`
- [ ] Fungsi `doGet()` untuk serve halaman

### Tahap 3 — Submit & simpan data
- [ ] Fungsi `submitReport()` — validasi input, simpan ke sheet `Reports` dengan status "Menunggu Approval PC"
- [ ] Test submit dari form ke sheet (tanpa email dulu)

### Tahap 4 — Notifikasi ke PC
- [ ] Fungsi `notifyPC()` — kirim email ke PC begitu ada laporan baru masuk, berisi ringkasan + link review
- [ ] Panggil fungsi ini otomatis setelah `submitReport()` berhasil

### Tahap 5 — Halaman approval PC & broadcast ke stakeholder
- [ ] Buat halaman/tampilan approval sederhana (list laporan pending untuk PC yang login)
- [ ] Fungsi `getPendingReports()` dan `approveReport()`
- [ ] Fungsi `sendStakeholderEmail()` — dipanggil otomatis setelah PC approve, kirim ke PM & stakeholder eksternal
- [ ] Update status laporan (Menunggu Approval PC → Approved → Terkirim) untuk logging

### Tahap 6 — Upload foto multi-file (opsional, bisa nyusul)
- [ ] Fungsi `uploadPhotos()` — simpan banyak foto sekaligus ke folder Drive `Project ID/Tanggal/`
- [ ] Integrasi ke form (input file dengan atribut `multiple`)
- [ ] Indikator loading saat proses upload berlangsung

### Tahap 7 — Testing & deploy
- [ ] Deploy sebagai Web App (Execute as: Me, Access: siapa saja dengan link / domain tertentu)
- [ ] Test end-to-end dengan beberapa proyek, PC, dan stakeholder dummy — termasuk skenario approve dan cek email akhir yang diterima stakeholder
- [ ] Dokumentasi singkat cara pakai untuk site engineer dan PC

## Belum Diputuskan / Perlu Didiskusikan Lagi Nanti
- Apakah perlu level laporan berbeda (ringkas untuk eksternal vs detail untuk internal)?
- Apakah nanti perlu dashboard riwayat laporan per proyek?
- Apakah perlu PDF attachment di email (bukan cuma HTML body)?
- Siapa yang pegang maintenance script ini ke depannya?
