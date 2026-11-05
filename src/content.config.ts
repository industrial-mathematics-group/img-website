import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const people = defineCollection({
  loader: glob({ base: './src/content/people', pattern: '*.yaml' }),
  schema: z.object({
    name: z.string(),
    role: z.string().optional(),
    orcid: z.string().url().optional(),
    github: z.string().optional(),
    website: z.string().url().optional(),
    // Lower numbers are listed first.
    order: z.number().default(100),
  }),
});

const software = defineCollection({
  loader: glob({ base: './src/content/software', pattern: '*.yaml' }),
  schema: z.object({
    name: z.string(),
    summary: z.string(),
    group: z.enum(['solve', 'explore', 'tools', 'paper-code']),
    // Packages in 'solve' and 'explore': 'application' sits above 'engine' in the stack diagram.
    layer: z.enum(['application', 'engine']).optional(),
    language: z.string(),
    repo: z.string().url(),
    docs: z.string().url().optional(),
    doi: z.string().optional(),
    // A page of this site where the package can be tried, e.g. /software/pdestudio/.
    demo: z.string().startsWith('/').optional(),
    order: z.number().default(100),
  }),
});

const research = defineCollection({
  loader: glob({ base: './src/content/research', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    software: z.array(reference('software')).default([]),
    order: z.number().default(100),
  }),
});

const publications = defineCollection({
  loader: glob({ base: './src/content/publications', pattern: '*.yaml' }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()).min(1),
    year: z.number().int(),
    status: z.enum(['manuscript', 'preprint', 'published']),
    venue: z.string().optional(),
    url: z.string().url(),
    code: z.string().url().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ base: './src/content/news', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
});

const legal = defineCollection({
  loader: glob({ base: './src/content/legal', pattern: '*.md' }),
  schema: z.object({ title: z.string() }),
});

export const collections = { people, software, research, publications, news, legal };
