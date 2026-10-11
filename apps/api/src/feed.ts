import { z } from 'zod';
import { DomainError, Post } from '../../../packages/core/src/index';

export type FeedCursor = { createdAt: string; id: string };
export type FeedPage = { items: Post[]; nextCursor: string | null };

export function decodeCursor(value?: string): FeedCursor | undefined {
  if (value === undefined) return undefined;
  try {
    return z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict()
      .parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
  } catch {
    throw new DomainError('INVALID_CURSOR', 'Invalid feed cursor.');
  }
}

export function feedPage(rows: Post[], limit: number): FeedPage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
      : null,
  };
}
