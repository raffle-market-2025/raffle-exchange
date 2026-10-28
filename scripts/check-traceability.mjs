#!/usr/bin/env node
/**
 * Проверка трассировки требований (T0.4).
 *
 * 1. В docs/traceability.md есть ровно по одной строке на каждый EC-001…EC-044.
 * 2. Для каждой строки, чей гейт ≤ текущему (docs/current-gate), есть тест с меткой
 *    `[ID]` — самого требования или его сценария.
 * 3. Метки в тестах ссылаются только на ID, существующие в матрице.
 *
 * Использование: node scripts/check-traceability.mjs [--gate G2]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GATES = ['G0', 'G1', 'G2', 'G3'];
const NON_B_GATES = new Set(['C', 'D', 'later']);
const EC_TOTAL = 44;

function fail(messages) {
  for (const message of messages) console.error(`✗ ${message}`);
  process.exit(1);
}

const argGate = process.argv.includes('--gate') ? process.argv[process.argv.indexOf('--gate') + 1] : undefined;
const currentGate = (argGate ?? readFileSync(join(ROOT, 'docs/current-gate'), 'utf8')).trim();
if (!GATES.includes(currentGate)) fail([`Неизвестный текущий гейт: "${currentGate}"`]);

// --- матрица ---
const rows = [];
for (const line of readFileSync(join(ROOT, 'docs/traceability.md'), 'utf8').split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 7) continue;
  const [, id, scenario, task, gate] = cells;
  if (!/^[A-Z]{1,2}-\d{2,3}$/.test(id)) continue;
  rows.push({ id, scenario, task, gate });
}

const errors = [];
const seen = new Map();
for (const row of rows) {
  seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
  if (!GATES.includes(row.gate) && !NON_B_GATES.has(row.gate)) {
    errors.push(`${row.id}: неизвестный гейт "${row.gate}"`);
  }
}
for (const [id, count] of seen) if (count > 1) errors.push(`${id}: строка повторяется ${count} раз`);
for (let n = 1; n <= EC_TOTAL; n += 1) {
  const id = `EC-${String(n).padStart(3, '0')}`;
  if (!seen.has(id)) errors.push(`${id}: нет строки в матрице`);
}

// --- метки в тестах ---
const known = new Set(rows.flatMap((r) => [r.id, r.scenario]).filter((v) => /^[A-Z]{1,2}-\d{2,3}$/.test(v)));
const tagsByFile = new Map();
for (const dir of ['apps', 'packages']) {
  for (const entry of readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.test\.(ts|mts|tsx)$/.test(entry.name)) continue;
    const path = join(entry.parentPath ?? entry.path, entry.name);
    if (/[\\/](node_modules|dist)[\\/]/.test(path)) continue;
    const tags = [...readFileSync(path, 'utf8').matchAll(/\[([A-Z]{1,2}-\d{2,3})\]/g)].map((m) => m[1]);
    if (tags.length) tagsByFile.set(relative(ROOT, path), tags);
  }
}
const covered = new Set();
for (const [file, tags] of tagsByFile) {
  for (const tag of tags) {
    if (!known.has(tag)) errors.push(`${file}: метка [${tag}] не найдена в матрице`);
    covered.add(tag);
  }
}

// --- требования наступивших гейтов ---
const gateIndex = GATES.indexOf(currentGate);
const due = rows.filter((r) => GATES.includes(r.gate) && GATES.indexOf(r.gate) <= gateIndex);
const missing = due.filter((r) => !covered.has(r.id) && !covered.has(r.scenario));
for (const r of missing) errors.push(`${r.id} (${r.scenario}, ${r.task}, гейт ${r.gate}): нет теста с меткой`);

// --- отчёт ---
const summary = {};
for (const r of rows) {
  const bucket = (summary[r.gate] ??= { total: 0, covered: 0 });
  bucket.total += 1;
  if (covered.has(r.id) || covered.has(r.scenario)) bucket.covered += 1;
}
console.log(`Текущий гейт: ${currentGate}. Строк в матрице: ${rows.length}.`);
for (const gate of [...GATES, 'C', 'D', 'later']) {
  if (summary[gate]) console.log(`  ${gate}: покрыто ${summary[gate].covered} из ${summary[gate].total}`);
}
if (errors.length) fail(errors);
console.log(`✓ Требования до гейта ${currentGate} включительно покрыты тестами (${due.length}).`);
