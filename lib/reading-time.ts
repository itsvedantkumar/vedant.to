import { readFileSync } from 'fs';
import { join } from 'path';

export function getReadingTime(slug: string): number {
  try {
    const raw = readFileSync(
      join(process.cwd(), 'content/posts', `${slug}.mdoc`),
      'utf-8'
    );
    const body = raw.replace(/^---[\s\S]*?---/, '').trim();
    const words = body.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  } catch {
    return 1;
  }
}
