// Blocks deployment while the legal pages or the domain are unfinished.
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const problems = [];

const legalDir = new URL('src/content/legal/', root);
for (const name of readdirSync(legalDir)) {
  const text = readFileSync(new URL(name, legalDir), 'utf8');
  for (const [marker] of text.matchAll(/\[TODO-LAUNCH:[^\]]*\]/g)) {
    problems.push(`src/content/legal/${name}: ${marker}`);
  }
}

const config = readFileSync(new URL('astro.config.mjs', root), 'utf8');
const site = config.match(/site:\s*'https:\/\/([^'/]+)/)?.[1];
const cnameFile = new URL('public/CNAME', root);
const cname = existsSync(cnameFile) ? readFileSync(cnameFile, 'utf8').trim() : null;
if (!cname) problems.push('public/CNAME is missing. Add a file that contains only the domain.');
else if (cname !== site) problems.push(`public/CNAME (${cname}) doesn't match site in astro.config.mjs (${site}).`);

if (problems.length > 0) {
  console.error(`Not ready to deploy:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Ready to deploy.');
