export const site = {
  name: 'Industrial Mathematics Group',
  tagline: 'Open mathematics for the industry of tomorrow',
  description:
    'Projects of the Industrial Mathematics Group: models, numerical methods and open-source software for problems from science and industry, with a focus on partial differential equations.',
  email: 'info@industrial-mathematics.org',
  github: 'https://github.com/industrial-mathematics-group',
  zenodo: 'https://zenodo.org/communities/img',
  aiPolicy:
    'https://github.com/industrial-mathematics-group/.github/blob/main/.github/CONTRIBUTING.md#ai-assisted-contributions',
};

// An internal path like /software/, with the base path the site is served under (see astro.config.mjs).
export const url = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;

export const navigation = [
  { href: '/research/', label: 'Research' },
  { href: '/software/', label: 'Software' },
  { href: '/explore/', label: 'Explore' },
  { href: '/publications/', label: 'Publications' },
  { href: '/team/', label: 'Team' },
  { href: '/news/', label: 'News' },
];
