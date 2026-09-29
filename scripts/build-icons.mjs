/**
 * Regenerates `src/ui/icons.ts` from the `lucide-static` package.
 *
 * The icons are vendored into a committed source file rather than imported at
 * runtime: the app ships no runtime dependencies, and a generated module keeps
 * the call sites (`iconLumen()`, `iconShop()`, …) exactly as they were.
 *
 * To change an icon, edit MAP below and run `npm run icons`. Names come from
 * https://lucide.dev/icons — the file name, minus `.svg`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = join(here, '..', 'node_modules', 'lucide-static', 'icons');
const OUT = join(here, '..', 'src', 'ui', 'icons.ts');

/** Exported name → [lucide icon, doc comment]. Order is the file's order. */
const MAP = [
  ['iconStreak', 'sunrise', 'Sunrise over the horizon — the streak mark.'],
  ['iconLumen', 'sparkles', 'Sparkles — Lumen, the day-to-day currency.'],
  ['iconAether', 'gem', 'A cut gem — Aether, and the Ascension screen.'],
  ['iconCinder', 'flame', 'A flame — Cinder, the quality currency.'],
  ['iconCheck', 'check', null],
  ['iconSkip', 'skip-forward', null],
  ['iconBack', 'chevron-left', null],
  ['iconClose', 'x', null],
  ['iconArrowUp', 'arrow-up', null],
  ['iconArrowDown', 'arrow-down', null],
  ['iconPlus', 'plus', null],
  ['iconTrash', 'trash-2', null],
  ['iconShop', 'store', null],
  ['iconHistory', 'chart-column', 'A bar chart — the Progress screen.'],
  ['iconSettings', 'settings', null],
  ['iconDayOff', 'moon', 'A crescent moon — the day-off button.'],
  ['iconLock', 'lock', null],
  ['iconChest', 'gift', 'A wrapped box — the reward chest.'],
  ['iconVault', 'vault', 'A vault door — where the city banks its output.'],
  ['iconWorkshop', 'hammer', 'A hammer — the Workshop, where Cinder is spent.'],
];

/** The drawing commands inside a lucide file, with the wrapper stripped. */
function body(name) {
  const file = join(ICON_DIR, `${name}.svg`);
  let svg;
  try {
    svg = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No lucide icon named "${name}". Check https://lucide.dev/icons`);
  }
  const inner = svg.slice(
    svg.indexOf('>', svg.indexOf('<svg')) + 1,
    svg.lastIndexOf('</svg>'),
  );
  const shapes = inner
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (shapes.length === 0) throw new Error(`Icon "${name}" came out empty.`);
  return shapes;
}

const version = JSON.parse(
  readFileSync(join(here, '..', 'node_modules', 'lucide-static', 'package.json'), 'utf8'),
).version;

const entries = MAP.map(([exportName, icon, doc]) => {
  const shapes = body(icon);
  const drawing = shapes.map((shape) => `    ${shape}`).join('\n');
  const comment = doc ? `/** ${doc} */\n` : '';
  return `${comment}export const ${exportName} = (): string =>\n  wrap(\n    \`\n${drawing}\n  \`,\n    '${icon}',\n  );`;
});

const out = `/**
 * Icon set — GENERATED, do not edit by hand.
 *
 * Drawings come from Lucide v${version} (ISC, https://lucide.dev), the
 * community fork of Feather Icons. They are vendored here so the app keeps no
 * runtime dependency and every glyph still inherits \`currentColor\`.
 *
 * Run \`npm run icons\` to regenerate; the icon-to-name mapping lives in
 * \`scripts/build-icons.mjs\`.
 */

/**
 * Lucide draws on a 24×24 grid at stroke width 2, and the geometry is tuned for
 * exactly that — scaling the stroke down to match the old hand-drawn set makes
 * the joins look frail at 16–18px, which is where nearly every glyph here is
 * rendered.
 */
const wrap = (body: string, name: string): string =>
  \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
     focusable="false" width="100%" height="100%" class="lucide lucide-\${name}">\${body}</svg>\`;

${entries.join('\n\n')}
`;

writeFileSync(OUT, out, 'utf8');
console.log(
  `Wrote ${MAP.length} icons to src/ui/icons.ts from lucide-static ${version}.`,
);
