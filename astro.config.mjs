import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { basePath, withBase } from './scripts/base-path.mjs';

// Must match public/CNAME. scripts/check-launch.mjs blocks deployment if they differ.
const domain = 'https://industrial-mathematics.org';

// Where GitHub Pages serves the site; see scripts/base-path.mjs.
const site = process.env.PAGES_URL ? new URL(process.env.PAGES_URL).origin : domain;
const base = basePath();

// Adds the base path to root-relative links and images in Markdown, like [our software](/software/).
function rehypeBasePath() {
  const visit = (node) => {
    for (const key of ['href', 'src']) {
      const value = node.properties?.[key];
      if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
        node.properties[key] = withBase(value, base);
      }
    }
    node.children?.forEach(visit);
  };
  return visit;
}

export default defineConfig({
  site,
  base,
  output: 'static',
  // Moved pages; GitHub Pages serves these as pages that forward to the new address. Astro doesn't add the base
  // path to the targets.
  redirects: {
    '/software/pdestudio': withBase('/explore/pdestudio/', base),
  },
  // Astro 7 defaults to 'jsx', which can drop spaces between inline elements.
  compressHTML: true,
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeBasePath],
    }),
  },
});
