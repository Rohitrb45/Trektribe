import { z } from 'zod';

export const chatPresenceInput = z.object({ tripId: z.uuid() }).strict();
export const chatSendInput = chatPresenceInput.extend({
  id: z.uuid(), body: z.string().trim().min(1).max(2000),
});
export const chatSyncInput = chatPresenceInput.extend({
  after: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export type ChatMessage = { id: string; sequence: number; author: string; body: string };
export type ChatAck<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface ClientChatEvents {
  'trip:send': (input: z.infer<typeof chatSendInput>, ack: (result: ChatAck<{ id: string; sequence: number }>) => void) => void;
  'trip:sync': (input: z.infer<typeof chatSyncInput>, ack: (result: ChatAck<{ items: ChatMessage[]; hasMore: boolean; nextSequence: number }>) => void) => void;
  'trip:presence': (input: z.infer<typeof chatPresenceInput>, ack: (result: ChatAck<{ online: { id: string; name: string }[] }>) => void) => void;
  'trip:away': () => void;
}
export interface ServerChatEvents {
  'trip:changed': (event: { tripId: string }) => void;
}
