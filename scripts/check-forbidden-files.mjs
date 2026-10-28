#!/usr/bin/env node
/**
 * Не даёт закоммитить сессии, профили браузера, трейсы обследования и ключи (07 §2, 02 §13).
 * Проверяет файлы, которые попадут в коммит: отслеживаемые и неигнорируемые новые.
 * Это страховка поверх .gitignore, а не замена ему: репозиторий может быть публичным.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const FORBIDDEN_PATHS = [
  [/(^|\/)\.env(\.[^/]*)?$/, 'файл окружения', (p) => !p.endsWith('.env.example')],
  [/storage-state[^/]*\.json$/, 'состояние браузерной сессии'],
  [/\.har$/, 'HAR-запись сетевого трафика'],
  [/(^|\/)trace[^/]*\.zip$/, 'Playwright trace'],
  [/(^|\/)(browser-)?profiles?\//, 'профиль браузера'],
  [/(^|\/)(Cookies|Login Data|Local State|Web Data)$/, 'файл профиля Chromium'],
  [/(^|\/)stage-a\//, 'артефакт обследования этапа A'],
  [/(^|\/)screenshots\//, 'скриншоты'],
  [/\.(pem|p12|pfx|key|jks|keystore)$/, 'ключ или хранилище ключей'],
  [/(^|\/)id_(rsa|ed25519)$/, 'SSH-ключ'],
];

const FORBIDDEN_CONTENT = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'приватный ключ'],
  [/postgres(ql)?:\/\/[^\s:@/]+:(?!exchange_local@|validate@|v@)[^\s@/]{6,}@(?!localhost|127\.0\.0\.1)/, 'строка подключения к внешней БД с паролем'],
];

let files;
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  console.error('✗ Нужен git-репозиторий');
  process.exit(1);
}

const errors = [];
for (const file of files) {
  for (const [pattern, label, extra] of FORBIDDEN_PATHS) {
    if (pattern.test(file) && (!extra || extra(file))) errors.push(`${file}: ${label}`);
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue; // удалён в рабочей копии
  }
  if (!stat.isFile() || stat.size > 2_000_000 || file === 'scripts/check-forbidden-files.mjs') continue;
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label] of FORBIDDEN_CONTENT) {
    if (pattern.test(text)) errors.push(`${file}: похоже на ${label}`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ Запрещённых файлов нет (проверено ${files.length}).`);
