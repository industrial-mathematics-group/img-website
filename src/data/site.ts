export const site = {
  name: 'Industrial Mathematics Group',
  tagline: 'Open mathematics for the industry of tomorrow',
  description:
    'We develop models, numerical methods and open-source software for problems from science and industry, with a focus on partial differential equations.',
  github: 'https://github.com/industrial-mathematics-group',
  zenodo: 'https://zenodo.org/communities/img',
  aiPolicy:
    'https://github.com/industrial-mathematics-group/.github/blob/main/.github/CONTRIBUTING.md#ai-assisted-contributions',
  university: { name: 'Technomathematics Group, RPTU Kaiserslautern', url: 'https://math.rptu.de/ags/techno' },
  address: ['Gottlieb-Daimler-Straße, Building 48', '67663 Kaiserslautern', 'Germany'],
};

// An internal path like /software/, with the base path the site is served under (see astro.config.mjs).
export const url = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;

export const navigation = [
  { href: '/research/', label: 'Research' },
  { href: '/software/', label: 'Software' },
  { href: '/publications/', label: 'Publications' },
  { href: '/team/', label: 'Team' },
  { href: '/news/', label: 'News' },
];
