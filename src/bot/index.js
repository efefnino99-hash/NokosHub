import { Bot, InlineKeyboard, InputFile } from 'grammy';
import QRCode from 'qrcode';
import { supabase } from '../config/supabase.js';
import { createTopup } from '../services/payment.js';

if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN belum diatur');
export const bot = new Bot(process.env.BOT_TOKEN);
const adminIds = new Set((process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const rupiah = n => `Rp${Number(n).toLocaleString('id-ID')}`;
const home = new InlineKeyboard()
  .text('💰 Saldo', 'balance').text('➕ Top up', 'topup').row()
  .text('🧾 Riwayat', 'history').text('🛍️ Katalog', 'catalog').row()
  .text('🆘 Bantuan', 'help');

bot.command('start', async ctx => {
  const u = ctx.from;
  const id = String(u.id);
  const { error: userErr } = await supabase.from('users').upsert({
    telegram_id: id, username: u.username || null,
    full_name: [u.first_name, u.last_name].filter(Boolean).join(' ')
  }, { onConflict: 'telegram_id' });
  if (userErr) throw userErr;
  const { error: walletErr } = await supabase.from('wallets').upsert({ telegram_id: id }, { onConflict: 'telegram_id', ignoreDuplicates: true });
  if (walletErr) throw walletErr;
  await ctx.reply(`Selamat datang di ${process.env.STORE_NAME || 'NokosRayHub'}!\n\nPilih menu di bawah.`, { reply_markup: home });
});

bot.callbackQuery('balance', async ctx => {
  await ctx.answerCallbackQuery();
  const { data, error } = await supabase.from('wallets').select('balance').eq('telegram_id', String(ctx.from.id)).maybeSingle();
  if (error) throw error;
  await ctx.reply(`💰 Saldo: ${rupiah(data?.balance || 0)}`);
});

bot.callbackQuery('topup', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.reply(`Kirim nominal dengan format:\n/topup 25000\nMinimal ${rupiah(process.env.TOPUP_MIN || 10000)}.`);
});

bot.command('topup', async ctx => {
  const amount = Number((ctx.match || '').trim());
  try {
    const payment = await createTopup(ctx.from.id, amount);
    const png = await QRCode.toBuffer(payment.qrString, { type: 'png', margin: 2, width: 600 });
    await ctx.replyWithPhoto(new InputFile(png, 'qris.png'), {
      caption: `🧾 TOP UP ${process.env.STORE_NAME || 'NokosRayHub'}\nNominal: ${rupiah(amount)}\nRef: ${payment.referenceId}\n\nBayar dengan scan QRIS ini. Saldo masuk setelah pembayaran terverifikasi oleh Xendit.`
    });
  } catch (e) {
    console.error('create topup:', e);
    await ctx.reply(`Gagal membuat QRIS: ${e.message}`);
  }
});

bot.callbackQuery('history', async ctx => {
  await ctx.answerCallbackQuery();
  const { data, error } = await supabase.from('topups').select('reference_id,amount,status,created_at').eq('telegram_id', String(ctx.from.id)).order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  if (!data?.length) return ctx.reply('Belum ada transaksi.');
  await ctx.reply(data.map(x => `${x.status.toUpperCase()} · ${rupiah(x.amount)} · ${x.reference_id}`).join('\n'));
});

bot.callbackQuery('catalog', async ctx => {
  await ctx.answerCallbackQuery();
  const { data, error } = await supabase.from('products').select('name,description,price').eq('active', true).order('name');
  if (error) throw error;
  await ctx.reply(data?.length ? data.map(p => `• ${p.name} — ${rupiah(p.price)}\n${p.description || ''}`).join('\n\n') : 'Katalog belum tersedia.');
});

bot.callbackQuery('help', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.reply('Bantuan NokosRayHub: hubungi admin melalui akun resmi toko. Jangan kirim password atau kode verifikasi akun kepada siapa pun.');
});

bot.command('admin', async ctx => {
  if (!adminIds.has(String(ctx.from.id))) return ctx.reply('Akses ditolak.');
  const [{ count: users }, { count: pending }, { data: paid }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('topups').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('topups').select('amount').eq('status', 'paid')
  ]);
  const revenue = (paid || []).reduce((s, x) => s + Number(x.amount), 0);
  await ctx.reply(`🛠 ADMIN NOKOSRAYHUB\nPelanggan: ${users || 0}\nTopup pending: ${pending || 0}\nTotal topup berhasil: ${rupiah(revenue)}\n\n/admin_users\n/admin_pending\n/admin_products`);
});

bot.command('admin_users', async ctx => {
  if (!adminIds.has(String(ctx.from.id))) return ctx.reply('Akses ditolak.');
  const { data, error } = await supabase.from('users').select('telegram_id,username,full_name,created_at').order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  await ctx.reply((data || []).map(u => `${u.telegram_id} | @${u.username || '-'} | ${u.full_name || '-'}`).join('\n') || 'Belum ada pelanggan.');
});

bot.command('admin_pending', async ctx => {
  if (!adminIds.has(String(ctx.from.id))) return ctx.reply('Akses ditolak.');
  const { data, error } = await supabase.from('topups').select('reference_id,telegram_id,amount,status').eq('status', 'pending').order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  await ctx.reply((data || []).map(t => `${t.reference_id} | ${t.telegram_id} | ${rupiah(t.amount)} | ${t.status}`).join('\n') || 'Tidak ada topup pending.');
});

bot.command('admin_products', async ctx => {
  if (!adminIds.has(String(ctx.from.id))) return ctx.reply('Akses ditolak.');
  const { data, error } = await supabase.from('products').select('id,name,price,active').order('name');
  if (error) throw error;
  await ctx.reply((data || []).map(p => `${p.id} | ${p.name} | ${rupiah(p.price)} | active=${p.active}`).join('\n') || 'Katalog kosong.');
});

bot.catch(err => console.error('grammY error:', err));
