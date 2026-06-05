/**
 * Render-time fallback for document node normalization.
 *
 * Keystatic throws "Unknown inline node type: X" when block nodes appear
 * where only inline nodes are expected. The normalize-content.mjs pre-commit
 * script fixes .mdoc files before they're committed, but this function acts
 * as a safety net for any content that slips through.
 *
 * Cases handled:
 * 1. List items that wrap their children in paragraph nodes (loose lists).
 * 2. Paragraph nodes that contain image block nodes — hoisted to standalone blocks.
 */

type DocNode = { type?: string; children?: DocNode[] } & Record<string, unknown>;

export function normalizeDoc<T extends DocNode>(nodes: T[]): T[] {
  return nodes.flatMap((node) => {
    if (node.type === 'unordered-list' || node.type === 'ordered-list') {
      return [
        {
          ...node,
          children: (node.children ?? []).map((item) => ({
            ...item,
            children: (item.children ?? []).flatMap((child) =>
              child.type === 'paragraph' ? (child.children ?? []) : [child]
            ),
          })),
        } as T,
      ];
    }

    if (node.type === 'paragraph') {
      const children = node.children ?? [];
      if (children.some((c) => c.type === 'image')) {
        return children.flatMap((child) => {
          if (child.type === 'image') return [child as T];
          return [{ type: 'paragraph', children: [child] } as T];
        });
      }
    }

    if (node.children) {
      return [{ ...node, children: normalizeDoc(node.children) } as T];
    }

    return [node];
  });
}
