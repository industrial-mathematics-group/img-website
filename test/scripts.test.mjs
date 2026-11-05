import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { basePath, withBase } from '../scripts/base-path.mjs';
import { checkLinks } from '../scripts/check-links.mjs';
import { normalise } from '../scripts/sync-zenodo.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/zenodo-records.json', import.meta.url), 'utf8'));

test('normalise maps a Zenodo response onto our record format', () => {
  assert.deepEqual(normalise(fixture), [
    {
      title: 'Example.jl',
      creators: ['Doe, Jane'],
      date: '2026-10-01',
      version: '1.2.3',
      type: 'Software',
      doi: '10.5281/zenodo.1',
    },
  ]);
});

test('normalise rejects an unexpected response', () => {
  assert.throws(() => normalise({ message: 'error' }), /hits/);
  assert.throws(() => normalise({ hits: { hits: [{ id: 7, metadata: {} }] } }), /title or DOI/);
});

test('checkLinks finds missing pages and anchors, and accepts valid links', () => {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  mkdirSync(join(root, 'about'));
  writeFileSync(join(root, 'about', 'index.html'), '<h2 id="team">Team</h2>');
  writeFileSync(
    join(root, 'index.html'),
    '<a href="/about/">ok</a><a href="/about/#team">ok</a><a href="https://example.org">ok</a>' +
      '<a href="/nope/">bad</a><a href="/about/#none">bad</a>',
  );
  assert.deepEqual(checkLinks(root), ['index.html: missing /nope/', 'index.html: missing anchor /about/#none']);
});

test('basePath reads the base path from the GitHub Pages address', () => {
  assert.equal(basePath(undefined), '/');
  assert.equal(basePath('https://industrial-mathematics.org'), '/');
  assert.equal(basePath('https://industrial-mathematics-group.github.io/img-website'), '/img-website');
  assert.equal(basePath('https://industrial-mathematics-group.github.io/img-website/'), '/img-website');
  assert.equal(withBase('/software/', '/'), '/software/');
  assert.equal(withBase('/software/', '/img-website'), '/img-website/software/');
});

test('checkLinks resolves links under a base path and rejects links outside it', () => {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  mkdirSync(join(root, 'about'));
  writeFileSync(join(root, 'about', 'index.html'), '<h2 id="team">Team</h2>');
  writeFileSync(
    join(root, 'index.html'),
    '<a href="/site/">ok</a><a href="/site">ok</a><a href="/site/about/#team">ok</a><a href="about/">ok</a>' +
      '<a href="/about/">bad</a><a href="/site/nope/">bad</a>',
  );
  assert.deepEqual(checkLinks(root, '/site'), [
    'index.html: outside the base path /site: /about/',
    'index.html: missing /site/nope/',
  ]);
});
