# Industrial Mathematics Group website

The source of the group's website, built with [Astro](https://astro.build) and hosted on GitHub Pages. Working on the site, by hand or with an agent? Start with [AGENTS.md](AGENTS.md).

## First-time setup

1. Create a public repository named `industrial-mathematics-group.github.io` in the organisation. With this name, the site is served from the root of the domain.
2. Install Node.js 26. The version is set in `.nvmrc`, so with nvm you can run `nvm install` in this folder.
3. Install the dependencies. This also creates `package-lock.json`, which the workflows need:

   ```bash
   npm install astro@latest @astrojs/markdown-remark@latest @astrojs/sitemap@latest \
     @fontsource-variable/source-serif-4@latest @fontsource-variable/space-grotesk@latest \
     katex@latest rehype-katex@latest remark-math@latest
   npm install -D @astrojs/check@latest @types/katex@latest typescript@latest
   npm run test:scripts
   npm run check
   npm run dev
   ```

4. Commit everything, including `package-lock.json`, and push.
5. In the repository, go to **Settings > Pages** and set the source to **GitHub Actions**.
6. Follow [SETUP.md in the org's `.github` repository](https://github.com/industrial-mathematics-group/.github/blob/main/SETUP.md) for the merge settings and for protecting `main`.

## Agent setup

The workflow in `.github/workflows/claude.yml` lets anyone with write access ask Claude to make a change by mentioning `@claude` in an issue or pull request.

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository only. You need to be an admin of the repository.
2. Create an API key in the [Claude Console](https://platform.claude.com), and consider setting a spending limit.
3. In this repository, go to **Settings > Secrets and variables > Actions** and add the key as a secret named `ANTHROPIC_API_KEY`.
4. Test it by opening an issue that mentions `@claude`.

Claude pushes a branch and posts a link to a pre-filled PR. A person then opens the PR, reviews it and fills in the AI declaration.

## Going live

The deploy workflow fails on purpose until these are done:

1. Complete the `[TODO-LAUNCH: ...]` notes in `src/content/legal/`.
2. Configure DNS for `industrial-mathematics.org` as described in [GitHub's custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site), and verify the domain for the organisation.

A custom domain on this repository also moves the docs of the Julia packages under it, for example to `https://industrial-mathematics.org/HyperCloud.jl/stable/`. After switching, check that the old `github.io` links redirect properly.

## Maintenance

- **Zenodo records:** updated on each deployment and every Monday. If Zenodo is unavailable, the site keeps the last records.
- **Scheduled runs:** GitHub turns off scheduled workflows after 60 days without repository activity. If that happens, re-enable the workflow in the Actions tab.
- **Dependencies:** Dependabot opens one grouped PR a month for npm and one for GitHub Actions.

## Licences

Code is under the [MIT License](LICENSE). The logos in `public/logos/` are under [CC BY 4.0](public/logos/LICENSE).
