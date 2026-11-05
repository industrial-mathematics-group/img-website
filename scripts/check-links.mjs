// Checks that every internal link and asset in the built site exists, including #anchors.
// Root-relative links must start with the base path the site is built for (see base-path.mjs).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePath } from './base-path.mjs';

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function resolveTarget(root, fromFile, pathname) {
  const decoded = decodeURIComponent(pathname);
  const base = decoded.startsWith('/') ? join(root, decoded) : resolve(dirname(fromFile), decoded);
  const candidates = [base, join(base, 'index.html'), `${base}.html`];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

export function checkLinks(root, base = '/') {
  const problems = [];
  for (const file of htmlFiles(root)) {
    const html = readFileSync(file, 'utf8');
    const attributes = html.matchAll(/\s(?:href|src)=(?:"([^"]*)"|'([^']*)')/g);
    for (const match of attributes) {
      const value = match[1] ?? match[2];
      if (!value || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;
      const [pathname, hash] = value.split('#');
      const where = relative(root, file);
      const inBase = base === '/' || pathname === base || pathname.startsWith(`${base}/`);
      if (pathname.startsWith('/') && !inBase) {
        problems.push(`${where}: outside the base path ${base}: ${value}`);
        continue;
      }
      const local = pathname.startsWith('/') && base !== '/' ? pathname.slice(base.length) || '/' : pathname;
      const target = local ? resolveTarget(root, file, local) : file;
      if (!target) {
        problems.push(`${where}: missing ${value}`);
      } else if (hash && target.endsWith('.html')) {
        const ids = readFileSync(target, 'utf8');
        if (!new RegExp(`\\sid=["']?${hash}["'\\s>]`).test(ids)) problems.push(`${where}: missing anchor ${value}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../dist', import.meta.url));
  const problems = checkLinks(root, basePath());
  if (problems.length > 0) {
    console.error(`Broken internal links:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('All internal links are fine.');
}
