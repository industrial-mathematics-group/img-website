// Updates src/data/zenodo.json from the group's Zenodo community.
// A failed sync only warns and keeps the existing file, so a Zenodo outage can't stop a deployment.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://zenodo.org/api/communities/img/records?size=100&sort=newest';
const OUTPUT = new URL('../src/data/zenodo.json', import.meta.url);

export function normalise(response) {
  const hits = response?.hits?.hits;
  if (!Array.isArray(hits)) throw new Error('The response has no hits.hits array.');
  return hits.map((hit) => {
    const meta = hit.metadata ?? {};
    const doi = hit.doi ?? meta.doi;
    if (!meta.title || !doi) throw new Error(`Record ${hit.id ?? '(no id)'} has no title or DOI.`);
    return {
      title: meta.title,
      creators: (meta.creators ?? []).map((creator) => creator.name).filter(Boolean),
      date: meta.publication_date ?? '',
      version: meta.version ?? '',
      type: meta.resource_type?.title ?? 'Record',
      doi,
    };
  });
}

async function main() {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'img-website-sync' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Zenodo answered ${response.status}.`);
  const records = normalise(await response.json());
  if (records.length === 0) throw new Error('Zenodo returned no records.');

  const current = JSON.parse(await readFile(OUTPUT, 'utf8'));
  if (JSON.stringify(current.records) === JSON.stringify(records)) {
    console.log(`Zenodo: ${records.length} records, no changes.`);
    return;
  }
  const output = { source: API_URL, updated: new Date().toISOString(), records };
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Zenodo: wrote ${records.length} records.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.warn(`::warning::Zenodo sync failed, keeping the existing records. ${error.message}`);
  });
}
