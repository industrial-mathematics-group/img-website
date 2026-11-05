// The path the site is served under. GitHub Pages serves it at the root of a custom domain, or
// under /<repository>/ on github.io while none is set. The deploy workflow passes the address
// from actions/configure-pages in PAGES_URL, e.g. https://industrial-mathematics-group.github.io/img-website.
// Without it, the site is built for the root of its domain.
export function basePath(pagesUrl = process.env.PAGES_URL) {
  if (!pagesUrl) return '/';
  return new URL(pagesUrl).pathname.replace(/\/+$/, '') || '/';
}

// Prefixes a root-relative path like /software/ with the base path.
export function withBase(path, base) {
  return base === '/' ? path : `${base}${path}`;
}
