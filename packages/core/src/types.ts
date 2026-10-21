export type Difficulty = 'Easy' | 'Moderate' | 'Hard';
export type Trek = {
  routeVersionId?: string; ownerId?: string; hasElevation?: boolean;
  id: string; title: string; region: string; description: string; difficulty: Difficulty;
  distanceKm: number; elevationM: number; duration: string; altitudeM: number;
  rating: number; reports: number; coordinates: [number, number];
  route: [number, number][]; highlights: string[]; color: string;
};
export type Post = {
  id: string; userId: string; author: string; initials: string; trekId: string;
  content: string; rating: number; condition: string; observedAt: string; createdAt: string;
  likedBy: string[];
};
export type Comment = { id: string; postId: string; userId: string; author: string; body: string; createdAt: string };
export type Member = { userId: string; status: 'accepted' | 'pending'; role?: 'member' | 'cohost' };
export type Trip = { routeVersionId?: string; id: string; trekId: string; title: string; organizerId: string; organizer: string; startsAt: string; timezone?: string; visibility?: 'public' | 'private'; maxParticipants: number; members: Member[]; status: 'open' | 'closed' };
export type Profile = { id: string; name: string; initials: string; username: string; bio: string; level: string; completed: number; distanceKm: number; gear: string[]; badges: string[] };
export type State = { version: 1; treks: Trek[]; posts: Post[]; comments: Comment[]; trips: Trip[]; saved: Record<string, string[]>; profile: Profile };
export type Command =
  | { type: 'profile'; name: string; bio: string; level: string; gear: string[] }
  | { type: 'create-trip'; id: string; trekId: string; title: string; startsAt: string; timezone: string; visibility?: 'public' | 'private'; maxParticipants: number }
  | { type: 'cancel-trip'; tripId: string }
  | { type: 'cohost'; tripId: string; userId: string; enabled: boolean }
  | { type: 'save'; trekId: string; saved: boolean }
  | { type: 'like'; postId: string; liked: boolean }
  | { type: 'post'; id: string; trekId: string; content: string; rating: number; condition: string; observedAt: string }
  | { type: 'comment'; id: string; postId: string; body: string }
  | { type: 'join'; tripId: string }
  | { type: 'leave'; tripId: string }
  | { type: 'approve'; tripId: string; userId: string };
export const DEMO_USER = '00000000-0000-4000-8000-000000000001';
