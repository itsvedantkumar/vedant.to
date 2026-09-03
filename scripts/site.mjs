#!/usr/bin/env node
// Prints one value from site.config.mjs for shell and workflow use:
//   node scripts/site.mjs url            -> the canonical origin
//   node scripts/site.mjs github.owner   -> the GitHub owner
//   node scripts/site.mjs host           -> the origin's host (derived)
import { site, siteHost, assetsHost } from '../site.config.mjs';

const key = process.argv[2];
const derived = { host: siteHost, assetsHost };
const value =
  key in derived
    ? derived[key]
    : key?.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), site);

if (typeof value !== 'string') {
  console.error(`site.mjs: unknown key "${key}"`);
  process.exit(1);
}
process.stdout.write(value);
