/**
 * Moves the install window in `.npmrc` forward to today minus 30 days.
 *
 * npm's `before` setting can't be computed at install time, so the date is
 * written into the file. Run this before deliberately updating dependencies:
 *
 *   npm run deps:window
 *   npm update            # or npm install <pkg>
 *
 * Never moves the window backwards, and never moves it past the cutoff — a
 * stale window is safe (packages only get older), a future one is not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WINDOW_DAYS = 30;
const NPMRC = join(dirname(fileURLToPath(import.meta.url)), '..', '.npmrc');
const BEFORE_LINE = /^before=(.*)$/m;

const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

const contents = readFileSync(NPMRC, 'utf8');
const match = BEFORE_LINE.exec(contents);

if (!match) {
  console.error(`No "before=" line found in ${NPMRC}. Refusing to guess.`);
  process.exit(1);
}

const current = match[1].trim();

if (current === cutoff) {
  console.log(`Install window already at ${cutoff} (today minus ${WINDOW_DAYS} days).`);
  process.exit(0);
}

if (current > cutoff) {
  console.error(
    `Install window is ${current}, which is newer than today minus ${WINDOW_DAYS} days ` +
      `(${cutoff}). Refusing to narrow the window.`,
  );
  process.exit(1);
}

writeFileSync(NPMRC, contents.replace(BEFORE_LINE, `before=${cutoff}`));
console.log(`Install window moved: ${current} -> ${cutoff}`);
console.log('Dependencies published after that date are still refused.');
