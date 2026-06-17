// Generate public/favicon.svg from @threadwick/core (the single source of truth for
// the logo). Run: `node scripts/gen-favicon.mjs` (also runs as a prebuild step).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logoSVG, logoIcons } from '@threadwick/core/brand';

const NOTE =
  '<!-- Generated from @threadwick/core (npm run gen:favicon). Icon: Font Awesome Pro 7 ' +
  'regular "compass-drafting", used under Threadwick\'s FA Pro commercial licence — https://fontawesome.com/license -->\n';

const out = fileURLToPath(new URL('../public/favicon.svg', import.meta.url));
writeFileSync(out, NOTE + logoSVG(logoIcons.studio) + '\n');
console.log('wrote', out);
