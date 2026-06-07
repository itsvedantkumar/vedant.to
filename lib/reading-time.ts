import { readFileSync } from 'fs';
import { join } from 'path';

export function getReadingStats(slug: string): { words: number; minutes: number } {
  if (!/^[a-z0-9-]+$/i.test(slug)) return { words: 0, minutes: 1 };
  try {
    const raw = readFileSync(
      join(process.cwd(), 'content/posts', `${slug}.mdoc`),
      'utf-8'
    );
    const body = raw.replace(/^---[\s\S]*?---/, '').trim();
    const words = body.split(/\s+/).filter(Boolean).length;
    return { words, minutes: Math.max(1, Math.ceil(words / 200)) };
  } catch {
    return { words: 0, minutes: 1 };
  }
}
