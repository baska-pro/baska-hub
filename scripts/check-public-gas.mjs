// Syntax/integrity and credential scan for both public GAS mirrors.
// Current checkout only: review Git history separately before publishing mirrors.
import fs from 'node:fs';
import crypto from 'node:crypto';

const mirrors = [
  { path: 'scripts/gas/telegram.gs', label: 'Telegram', minimum: 50_000, marker: 'handleLaviTelegramWebhook_' },
  { path: 'scripts/gas/whatsapp-notofication.gs', label: 'WhatsApp', minimum: 40_000, marker: 'WuzAPI' },
];

const secretPatterns = [
  ['Telegram bot token', /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub access token', /\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ['OpenAI-like secret', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Bearer literal', /\bBearer\s+[A-Za-z0-9._-]{24,}\b/],
];

for (const item of mirrors) {
  if (!fs.existsSync(item.path)) throw new Error(`Missing ${item.path}`);
  const source = fs.readFileSync(item.path, 'utf8');
  if (Buffer.byteLength(source, 'utf8') < item.minimum) {
    throw new Error(`Unexpectedly short GAS mirror: ${item.path}`);
  }
  for (const marker of ['PropertiesService', 'UrlFetchApp', item.marker]) {
    if (!source.includes(marker)) throw new Error(`Missing expected marker ${marker} in ${item.path}`);
  }
  for (const [name, pattern] of secretPatterns) {
    if (pattern.test(source)) {
      throw new Error(`Potential ${name} in ${item.path}; do not publish secrets`);
    }
  }
  const checksum = crypto.createHash('sha256').update(source).digest('hex');
  console.log(`${item.label} mirror check passed: bytes=${Buffer.byteLength(source)} sha256=${checksum}`);
}
