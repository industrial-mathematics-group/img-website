import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  // Must match public/CNAME. scripts/check-launch.mjs blocks deployment if they differ.
  site: 'https://industrial-mathematics.org',
  output: 'static',
  // Astro 7 defaults to 'jsx', which can drop spaces between inline elements.
  compressHTML: true,
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
});
