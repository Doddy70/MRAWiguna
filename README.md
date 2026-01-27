# Bengkel Assistant

Sistem manajemen reservasi servis untuk Bengkel Wiguna (admin MRA + portal kustomer).
Backend menggunakan Express + SQLite, frontend berupa halaman statis di folder `public`.

## Fitur utama
- Form booking (online + walk-in) masuk ke panel admin.
- Admin MRA: follow-up WhatsApp, reschedule, edit reservasi, progress servis, upload foto.
- Progress servis tampil di portal kustomer (stepper + foto).
- Trash (arsip) untuk soft delete data reservasi.

## Teknologi
- Node.js + Express
- SQLite (file `bengkel.db`)
- Frontend HTML/CSS/JS (folder `public`)

## Struktur proyek
- `server.js` - server Express + API
- `public/` - halaman HTML, CSS, JS, aset
- `bengkel.db` - database SQLite (lokal)
- `seed*.js` - skrip seed data

## Menjalankan lokal
```bash
cd "Bengkel Assistant"
npm install
npm start
```
Server akan berjalan di `http://localhost:3000`.

## Environment
Copy dari `.env.example` ke `.env` lalu sesuaikan:
- `ADMIN_USER`, `ADMIN_PASSWORD`
- `OPENAI_API_KEY` (opsional, hanya jika chat diaktifkan)
- `DB_PATH` (opsional)

## Akun default admin
Jika tidak diubah di `.env`:
- Username: `admin`
- Password: `admin123`

## Endpoint publik penting
- `/api/public/wp-posts` - artikel WordPress (6 terbaru)
- `/api/public/youtube-videos` - video YouTube (via RSS)

## Trash (Soft Delete)
Reservasi yang di-arsipkan masuk ke tab **Trash** dan tidak tampil di daftar utama.
Dari Trash, admin bisa:
- Pulihkan (restore)
- Hapus permanen

## Deploy VPS (ringkas)
- Gunakan `npm start` (bukan `npm run dev`)
- Jalankan via PM2/Node app manager di aaPanel
- Aktifkan HTTPS
- Backup `bengkel.db` secara berkala

## Catatan
Folder `public/uploads` berisi foto progress servis. Pastikan dibackup jika dibutuhkan.
