// Plain-text excerpt of a Keystatic document. Input is `unknown[]` so callers
// pass `await entry.content()` directly with no cast; the guards below verify
// the shape node by node.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function flattenText(node: unknown): string {
  if (!isRecord(node)) return '';
  let result = typeof node.text === 'string' ? node.text : '';
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      result += flattenText(child);
    }
  }
  return result;
}

export function docToExcerpt(
  doc: readonly unknown[] | null | undefined,
  max = 80
): string {
  if (!doc) return '';

  for (const node of doc) {
    const text = flattenText(node).replace(/\s+/g, ' ').trim();
    if (text) {
      const chars = Array.from(text);
      if (chars.length > max) {
        return chars.slice(0, max).join('').trimEnd() + '…';
      }
      return text;
    }
  }

  return '';
}
