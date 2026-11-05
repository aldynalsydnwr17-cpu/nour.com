'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const { validName, checkName, findAvailable, sleep } = require('./core');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('حط DISCORD_TOKEN في متغيرات البيئة عند الاستضافة'); process.exit(1); }
const PREFIX = process.env.PREFIX || '!';
const ALLOWED = (process.env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean); // فاضي = الكل
const CHANNEL = process.env.CHECKER_CHANNEL_ID || '';                                                   // فاضي = أي شات
const MAX_CHECK = 10, MAX_WANT = 10, MAX_TRIES = 60, COOLDOWN_MS = 45_000, DELAY_MS = 1300;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const busy = new Set(), last = new Map();
const green = 0x23a559, red = 0xed4245, grey = 0x5865f2;
const ICON = { available: '🟢 متاح', taken: '🔴 مأخوذ', invalid: '⚠️ مش صالح', limited: '⏳ ضغط من ديسكورد', error: '❌ خطأ' };

client.once(Events.ClientReady, (c) => console.log('جاهز: ' + c.user.tag));

client.on(Events.MessageCreate, async (m) => {
  try {
    if (m.author.bot || !m.guild || !m.content.startsWith(PREFIX)) return;
    if (CHANNEL && m.channel.id !== CHANNEL) return;
    const [cmd, ...args] = m.content.slice(PREFIX.length).trim().split(/\s+/);
    const c = (cmd || '').toLowerCase();
    if (!['check', 'gen', 'help', 'فحص'].includes(c)) return;
    if (ALLOWED.length && !ALLOWED.includes(m.author.id)) return m.reply('مش مسموحلك تستخدم الفاحص.');

    if (c === 'help') {
      return m.reply({ embeds: [new EmbedBuilder().setColor(grey).setTitle('فاحص اليوزرات').setDescription(
        `\`${PREFIX}check x2f2 86ac\` فحص يوزر أو أكتر (لحد ${MAX_CHECK})\n` +
        `\`${PREFIX}gen\` يطلّع 5 يوزرات رباعية متاحة (حروف وأرقام)\n` +
        `\`${PREFIX}gen 8 4\` عدد المتاح (لحد ${MAX_WANT}) وطول اليوزر (من 3 لـ 6)\n\n` +
        'اللي يطلع متاح ممكن حد ياخده قبلك، خده بسرعة من إعدادات حسابك.')] });
    }

    if (busy.has(m.author.id)) return m.reply('لسه بفحص طلبك اللي فات، استنى يخلص.');
    const now = Date.now(), cd = (last.get(m.author.id) || 0) + COOLDOWN_MS - now;
    if (c !== 'check' && cd > 0) return m.reply(`استنى ${Math.ceil(cd / 1000)} ثانية قبل ما تطلب تاني.`);

    if (c === 'check' || c === 'فحص') {
      const names = [...new Set(args.map((a) => a.replace(/^@/, '').toLowerCase()))].slice(0, MAX_CHECK);
      if (!names.length) return m.reply(`اكتب يوزر: \`${PREFIX}check x2f2\``);
      busy.add(m.author.id);
      try {
        const msg = await m.reply('بفحص ' + names.length + ' يوزر…'), rows = [];
        for (const n of names) { const r = await checkName(n); rows.push(`${ICON[r.status]}  \`${n}\``); if (r.status === 'limited') break; await sleep(DELAY_MS); }
        const ok = rows.some((r) => r.startsWith('🟢'));
        await msg.edit({ content: '', embeds: [new EmbedBuilder().setColor(ok ? green : red).setTitle('نتيجة الفحص').setDescription(rows.join('\n'))] });
      } finally { busy.delete(m.author.id); }
      return;
    }

    if (c === 'gen') {
      const want = Math.max(1, Math.min(MAX_WANT, parseInt(args[0], 10) || 5)), len = Math.max(3, Math.min(6, parseInt(args[1], 10) || 4));
      busy.add(m.author.id); last.set(m.author.id, now);
      try {
        const msg = await m.reply(`بدوّر على ${want} يوزر متاح (${len} خانات)… ممكن ياخد دقيقة.`);
        let lastEdit = 0;
        const r = await findAvailable({ want, len, maxTries: MAX_TRIES, delayMs: DELAY_MS, onProgress: async (p) => {
          if (Date.now() - lastEdit < 6000) return; lastEdit = Date.now();
          msg.edit(`بدوّر… فحصت ${p.tried}/${p.maxTries} ولقيت ${p.found.length}/${want}`).catch(() => {});
        } });
        const e = new EmbedBuilder().setColor(r.found.length ? green : red).setTitle(r.found.length ? 'يوزرات متاحة' : 'ملقيتش يوزر متاح');
        e.setDescription(r.found.length ? '```\n' + r.found.join('\n') + '\n```' : 'جرّب تاني بعد شوية، أو زوّد الطول.');
        e.setFooter({ text: `فحصت ${r.tried} يوزر` + (r.limited ? ' • ديسكورد حدّ الطلبات، جرّب بعد دقيقة' : '') });
        await msg.edit({ content: '', embeds: [e] });
      } finally { busy.delete(m.author.id); }
    }
  } catch (e) { console.error(e); }
});

client.login(TOKEN);
