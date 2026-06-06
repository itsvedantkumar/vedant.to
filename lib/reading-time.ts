import { readFileSync } from 'fs';
import { join } from 'path';

export function getReadingStats(slug: string): { words: number; minutes: number } {
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
