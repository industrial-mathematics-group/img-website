// Updates src/data/aidecl-badges.json with the AI declaration badges of our repositories, which their workflows
// publish to the `badges` branch: aidecl-*.json for the declared files (aidecl lint) and ai-*.json for the
// declared history of pull requests. The site shows them itself, so visitors load nothing from GitHub or shields.io.
// A failed sync only warns and keeps the existing file, so an outage can't stop a deployment.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OWNER = 'industrial-mathematics-group';
export const REPOSITORIES = [
  'HyperCloudCore.jl',
  'HyperCloud.jl',
  'PDEStudioCore.jl',
  'PDEStudio.jl',
  'aidecl',
  'meshfree-solver-paper',
  'img-website',
];
export const AXES = ['generation', 'human-review', 'ai-review'];
// The badge files: per kind, the file name of each axis.
const KINDS = {
  files: { generation: 'aidecl-generation', 'human-review': 'aidecl-human-review', 'ai-review': 'aidecl-ai-review' },
  changes: { generation: 'ai-generation', 'human-review': 'ai-human-review', 'ai-review': 'ai-review' },
};
const OUTPUT = new URL('../src/data/aidecl-badges.json', import.meta.url);

const badgeUrl = (repo, file) => `https://raw.githubusercontent.com/${OWNER}/${repo}/badges/${file}.json`;

// A shields.io endpoint badge, e.g. { label: 'AI generation (lines)', message: 'G2 68% · G3 32%' }, with the
// message split into levels and shares. Returns null for badges without declarations.
export function normalise(badge) {
  if (typeof badge?.label !== 'string' || typeof badge?.message !== 'string') throw new Error('A badge needs a label and a message.');
  const parts = badge.message.split('·').map((part) => part.trim().match(/^([GHA][0-3]|undeclared)\s+(\d+(?:\.\d+)?)%$/));
  if (parts.some((match) => !match)) return null;
  return {
    label: badge.label,
    message: badge.message,
    weight: /\(lines\)/.test(badge.label) ? 'lines' : 'files',
    shares: parts.map(([, level, percent]) => ({ level, percent: Number(percent) })),
  };
}

async function fetchBadge(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'img-website-sync' }, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return normalise(await response.json());
}

async function main() {
  const repositories = [];
  for (const repo of REPOSITORIES) {
    const entry = { repo, url: `https://github.com/${OWNER}/${repo}` };
    for (const [kind, files] of Object.entries(KINDS)) {
      const badges = await Promise.all(AXES.map((axis) => fetchBadge(badgeUrl(repo, files[axis]))));
      if (badges.every(Boolean)) entry[kind] = Object.fromEntries(AXES.map((axis, i) => [axis, badges[i]]));
    }
    repositories.push(entry);
  }
  if (!repositories.some((r) => r.files || r.changes)) throw new Error('No repository has badges.');

  const current = JSON.parse(await readFile(OUTPUT, 'utf8'));
  if (JSON.stringify(current.repositories) === JSON.stringify(repositories)) {
    console.log('AI declaration badges: no changes.');
    return;
  }
  await writeFile(OUTPUT, `${JSON.stringify({ updated: new Date().toISOString(), repositories }, null, 2)}\n`);
  console.log(`AI declaration badges: wrote ${repositories.length} repositories.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.warn(`::warning::AI declaration badge sync failed, keeping the existing badges. ${error.message}`);
  });
}
