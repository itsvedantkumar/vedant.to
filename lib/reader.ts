import { createReader } from '@keystatic/core/reader';
import keystaticConfig from '../keystatic.config';

// createReader reads content files from the filesystem at build time / in Node.js
// Do NOT use this in edge runtime routes
export const reader = createReader(process.cwd(), keystaticConfig);
