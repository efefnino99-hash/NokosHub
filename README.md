# NokosRayHub — starter Vercel + grammY + Supabase + Xendit

Starter ini menyediakan menu Telegram, wallet, topup QRIS, riwayat, katalog produk yang dimasukkan admin lewat Supabase, dan perintah admin dasar. Ini belum merupakan sistem reseller nomor OTP dan tidak menangkap, meneruskan, atau menjual kode verifikasi dari layanan pihak ketiga. Gunakan hanya untuk produk/nomor yang dimiliki atau didistribusikan secara sah dan sesuai kebijakan provider.

## 1. Setup
1. Buat project Supabase.
2. Jalankan `database/schema.sql` di SQL Editor.
3. Isi Environment Variables di Vercel berdasarkan `.env.example`.
4. Deploy repository ke Vercel.
5. Daftarkan webhook Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<PROJECT>.vercel.app/api/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

6. Atur Xendit Payment Request callback ke `https://<PROJECT>.vercel.app/api/xendit` dan gunakan callback token yang sama dengan `XENDIT_WEBHOOK_TOKEN`.

## 2. Xendit
Kode memakai Payment Request API v3 (`POST /v3/payment_requests`), `channel_code: QRIS`, `api-version: 2024-11-11`, dan membaca action `QR_STRING`. Uji dulu di mode test dan cocokkan payload webhook dengan event yang aktif pada akun Xendit. Jangan aktifkan produksi sebelum webhook diverifikasi.

## 3. Admin
ID admin awal di `.env.example` adalah `8942320889`. Perintah admin: `/admin`, `/admin_users`, `/admin_pending`, `/admin_products`.

## 4. Menjalankan lokal
```bash
npm install
cp .env.example .env
npx vercel dev
```

## 5. Catatan keamanan sebelum produksi
- Jangan commit `.env`.
- Gunakan hanya `SUPABASE_SERVICE_ROLE_KEY` di server.
- Tambahkan kebijakan privasi, syarat layanan, proses refund, batas transaksi, dan pemeriksaan risiko.
- Tambahkan rate limiting dan alert monitoring sebelum membuka layanan umum.
- Admin product CRUD dan penyesuaian saldo manual belum diaktifkan pada starter ini; lakukan lewat Supabase Dashboard sampai panel admin dengan audit trail dibuat.
