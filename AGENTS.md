# Industrial Mathematics Group website

A fully static Astro site, deployed to GitHub Pages. There is no server, database or CMS.

## Commands

```bash
npm ci                 # install from the lockfile
npm run dev            # local preview at http://localhost:4321
npm run check          # type check, build and internal link check; run before every PR
npm run test:scripts   # tests for the scripts in scripts/ and the two demos
```

The Node.js version is set in `.nvmrc`, and all workflows read it from there. To change it, edit that file and `engines` in `package.json`.

## Where things live

| To change | Edit |
|:---|:---|
| A person | `src/content/people/<name>.yaml` |
| A software package | `src/content/software/<name>.yaml` |
| A research area | `src/content/research/<order>-<name>.md` |
| A paper | `src/content/publications/<first-author-year>.yaml` |
| A news post | `src/content/news/<slug>.md` |
| Imprint and privacy | `src/content/legal/` |
| Name, address, navigation, external links | `src/data/site.ts` |
| Colours, type and layout | `src/styles/global.css` |
| Allowed fields for all content | `src/content.config.ts` |
| Front-page demo | `public/js/traffic.js` (drawing and controls) and `public/js/kinetic-traffic.js` (the model), explained in `src/content/news/traffic-demo.md` |
| PDEStudio in the browser | `src/pages/software/pdestudio.astro`, `public/js/pdestudio/` (panel rules in `logic.js`), data in `public/pdestudio/` |

`src/data/zenodo.json` is written by `scripts/sync-zenodo.mjs` during deployment. Don't edit it by hand.

`public/pdestudio/*.json` is written by `tools/pdestudio-demo/export.jl` from the built-in examples of PDEStudioCore (the version pinned in its `Project.toml`). Don't edit it by hand; to update it, raise that version and run `julia --project=tools/pdestudio-demo tools/pdestudio-demo/export.jl` (instantiate the environment first). Keep `public/js/pdestudio/data.js` in step with the format.

## Rules for content

- Never invent facts. People, roles, papers, dates, DOIs and results must come from a source you can point to, such as a repository, paper or the person concerned. If something is missing, leave it out and say so in the PR.
- Ask before adding personal details beyond what a person has published themselves. Don't add email addresses or photos without their consent.
- Math in Markdown uses `$...$` and `$$...$$`, rendered with KaTeX at build time.
- Write in plain, specific language. Describe what something does rather than promoting it.

## Rules for code

- Add content before adding components. Reuse what's in `src/components/` and `src/styles/global.css`.
- Use only the colour and font variables in `global.css`. Colours come from the logo kit in the org's `.github` repository.
- Keep the site static: no `output: 'server'`, adapters, analytics, cookies, or fonts and scripts from third-party hosts.
- Astro 7 rejects unclosed tags, and needs valid nesting (no `<div>` inside `<p>`).
- Until the custom domain is set, GitHub Pages serves the site under `/img-website/`. In `.astro` files, write internal links and files from `public/` with `url()` from `src/data/site.ts`, e.g. `href={url('/software/')}`. In Markdown, plain links like `/software/` are fine; the build adds the base path. `npm run check` doesn't catch a missing `url()`, but the check workflow does.
- Every page must work without JavaScript. The two demos (the front page and PDEStudio in the browser) are the only exceptions, and their text must still make sense without it.
- The demo must stay pausable and must not start moving under `prefers-reduced-motion`.

## Pull requests

All changes go through a PR into `main` and are squash-merged. Fill in the AI declaration in the PR template honestly, using the [group's AI policy](https://github.com/industrial-mathematics-group/.github/blob/main/.github/CONTRIBUTING.md#ai-assisted-contributions). A person must take responsibility for each change.

The `site-preview` artifact on each PR contains the built site.

When you run through the `@claude` workflow, you push a branch and post a link to a pre-filled PR. Run `npm ci` and `npm run check` first. End your final comment with suggested AI declaration lines. Don't tick review levels for the human, who opens the PR and completes the declaration.

## Going live

`scripts/check-launch.mjs` stops deployment until the following are done. Don't weaken or remove this check to get a deployment through. The people responsible must supply the missing details.

- No `[TODO-LAUNCH: ...]` markers remain in `src/content/legal/`.
- `public/CNAME` contains the domain, and `domain` in `astro.config.mjs` uses the same one.
