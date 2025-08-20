import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing. Please set it in .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Загружаем вопросы
const questionsPath = path.resolve(__dirname, '../../questions.json');
let questions = [];
try {
  const raw = fs.readFileSync(questionsPath, 'utf-8');
  questions = JSON.parse(raw);
} catch (e) {
  console.error('❌ Failed to read questions.json', e);
}

// В памяти храним сессии и результаты
const sessionIdToChatId = new Map();
const chatIdToResults = new Map();
const issuedPromoCodes = new Set();

function generatePromoCode() {
  let code;
  do {
    const random = Math.random().toString(36).toUpperCase().slice(2, 6);
    code = `FREEBET-${random}`;
  } while (issuedPromoCodes.has(code));
  issuedPromoCodes.add(code);
  return code;
}

// REST endpoint для отправки результатов из веба
app.post('/api/submit', (req, res) => {
  const { sessionId, answers } = req.body || {};
  if (!sessionId || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const chatId = sessionIdToChatId.get(sessionId);
  if (!chatId) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Проверяем ответы
  let correctCount = 0;
  questions.forEach((q, idx) => {
    if (answers[idx] === q.answerIndex) correctCount += 1;
  });
  const allCorrect = correctCount === questions.length;

  chatIdToResults.set(chatId, { answers, correctCount, total: questions.length, allCorrect });

  // Уведомляем в боте
  if (allCorrect) {
    const promo = generatePromoCode();
    bot.telegram.sendMessage(
      chatId,
      `🎉 Поздравляем! Все ответы верны.\nВаш промокод: ${promo}`
    );
  } else {
    bot.telegram.sendMessage(
      chatId,
      'Спасибо за участие! Вы автоматически участвуете в розыгрыше.'
    );
  }

  // Удаляем одноразовую сессию
  sessionIdToChatId.delete(sessionId);
  res.json({ ok: true });
});

// Endpoint для получения вопросов
app.get('/api/questions', (_req, res) => {
  res.json({ questions });
});

// ==== Telegram Bot ====
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  const chatId = ctx.chat.id;
  const sessionId = uuidv4();
  sessionIdToChatId.set(sessionId, chatId);
  const url = `${WEB_URL}/?sessionId=${sessionId}`;
  ctx.reply(
    'Привет! Готовы проверить знания и получить фрибет?\nНажмите кнопку ниже, чтобы начать викторину.',
    Markup.inlineKeyboard([
      [Markup.button.url('🚀 Начать викторину', url)]
    ])
  );
});

bot.command('quiz', (ctx) => bot.start(ctx));

// Запускаем бота через polling
bot.launch({ polling: true })
  .then(() => console.log('🤖 Bot started (polling mode)'))
  .catch(console.error);

// Express сервер (для API)
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

// Обработка остановки
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


