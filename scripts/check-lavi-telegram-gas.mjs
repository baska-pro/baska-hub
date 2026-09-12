import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2] || 'scripts/gas/telegram.gs';
if (!fs.existsSync(file)) throw new Error(`Missing Lavi Telegram GAS mirror: ${file}`);
const src = fs.readFileSync(file, 'utf8');

if (Buffer.byteLength(src, 'utf8') < 50000) {
  throw new Error('telegram.gs is unexpectedly small; mirror may be truncated.');
}

const required = [
  'setupLaviFinanceTelegram',
  'checkLaviFinanceTelegramStatus',
  'handleLaviTelegramWebhook_',
  'showMonthlyDashboard_',
  'executeNaturalSearch_',
  'sendExport_',
  'showSystemStatus_',
  'performUndo_',
  'btn_dashboard_month',
  'btn_system_status',
  'btn_export',
  'finance.lavi.web.id',
  'finance.lavi.web.id/data?tx=',
  'LAVI_FINANCE_TELEGRAM_LARGE_EXPENSE_THRESHOLD',
  'LAVI_FINANCE_TELEGRAM_LOW_BALANCE_THRESHOLD'
];

for (const marker of required) {
  if (!src.includes(marker)) throw new Error(`Missing required Telegram GAS marker: ${marker}`);
}

const forbidden = [
  ['Telegram bot token literal', /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/],
  ['Google API key literal', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token literal', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['OpenAI-style secret literal', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['Private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Bearer credential literal', /Bearer\s+[A-Za-z0-9._-]{20,}/]
];

for (const [label, regex] of forbidden) {
  if (regex.test(src)) throw new Error(`${label} detected in public mirror.`);
}

if (!/const\s+VERSION\s*=\s*['"][^'"]+['"]/.test(src)) {
  throw new Error('Telegram GAS VERSION marker is missing.');
}

const sha256 = crypto.createHash('sha256').update(Buffer.from(src, 'utf8')).digest('hex');
console.log(`Lavi Telegram GAS mirror smoke passed: ${file}`);
console.log(`bytes=${Buffer.byteLength(src, 'utf8')} sha256=${sha256}`);
