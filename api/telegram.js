import { webhookCallback } from 'grammy';
import { bot } from '../src/bot/index.js';

const handle = webhookCallback(bot, 'http', {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  timeoutMilliseconds: 9000
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return handle(req, res);
}
