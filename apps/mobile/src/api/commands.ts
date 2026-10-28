import type { Command } from '@trektribe/core';
import { apiData, createApiClient } from './client';

function choice<T extends string>(value: string, values: readonly T[]): T {
  const match = values.find(item => item === value);
  if (match === undefined) throw new Error(`Unsupported value: ${value}`);
  return match;
}

/** Serializing commands stays separate from the application's mutation queue. */
export async function executeCommand(client: ReturnType<typeof createApiClient>, command: Command): Promise<void> {
  switch (command.type) {
    case 'profile':
      await apiData(client.POST('/me', { body: { name: command.name, bio: command.bio, gear: command.gear,
        level: choice(command.level, ['Beginner', 'Intermediate', 'Experienced'] as const) } })); break;
    case 'post':
      await apiData(client.POST('/posts', { body: { id: command.id, trekId: command.trekId, content: command.content,
        rating: command.rating, observedAt: command.observedAt,
        condition: choice(command.condition, ['Clear', 'Muddy', 'Snow', 'Blocked', 'Unknown'] as const) } })); break;
    case 'create-trip':
      await apiData(client.POST('/group-treks', { body: { id: command.id, trekId: command.trekId, title: command.title,
        startsAt: command.startsAt, timezone: command.timezone, visibility: command.visibility ?? 'public', maxParticipants: command.maxParticipants } })); break;
    case 'comment':
      await apiData(client.POST('/posts/{id}/comments', { params: { path: { id: command.postId } }, body: { id: command.id, body: command.body } })); break;
    case 'save':
      await apiData(client.POST('/me/saved-treks/{id}', { params: { path: { id: command.trekId } }, body: { saved: command.saved } })); break;
    case 'like':
      await apiData(client.POST('/posts/{id}/like', { params: { path: { id: command.postId } }, body: { liked: command.liked } })); break;
    case 'cancel-trip':
      await apiData(client.POST('/group-treks/{id}/cancel', { params: { path: { id: command.tripId } }, body: {} })); break;
    case 'join':
      await apiData(client.POST('/group-treks/{id}/join', { params: { path: { id: command.tripId } }, body: {} })); break;
    case 'leave':
      await apiData(client.POST('/group-treks/{id}/leave', { params: { path: { id: command.tripId } }, body: {} })); break;
    case 'approve':
      await apiData(client.POST('/group-treks/{id}/approve', { params: { path: { id: command.tripId } }, body: { userId: command.userId } })); break;
    case 'cohost':
      await apiData(client.POST('/group-treks/{id}/cohosts', { params: { path: { id: command.tripId } }, body: { userId: command.userId, enabled: command.enabled } })); break;
    default: { const unsupported: never = command; throw new Error(`Unsupported command: ${unsupported}`); }
  }
}
