export * from './types';
export * from './seed';
import { Command, State, Trek } from './types';
export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
function requireValue<T>(value: T | undefined): T {
  if (!value) throw new DomainError('NOT_FOUND', 'This item could not be found.', 404);
  return value;
}
export function distanceKm(a: [number,number], b: [number,number]): number {
  const rad = (n: number) => n * Math.PI / 180;
  const dlat = rad(b[1]-a[1]), dlon = rad(b[0]-a[0]);
  const h = Math.sin(dlat/2)**2 + Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function searchTreks(treks: Trek[], q = '', difficulty = 'All', origin?: [number,number], radiusKm = 100) {
  return treks.filter(t => `${t.title} ${t.region} ${t.highlights.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter(t => difficulty === 'All' || t.difficulty === difficulty)
    .filter(t => !origin || distanceKm(origin,t.coordinates) <= radiusKm)
    .sort((a,b) => origin ? distanceKm(origin,a.coordinates)-distanceKm(origin,b.coordinates) : 0);
}
/** Pure demo reducer. The API serializes access; PostgreSQL uses row locks instead. */
export function applyCommand(state: State, command: Command, actor: string, now = new Date().toISOString()): State {
  const s: State = JSON.parse(JSON.stringify(state));
  if (command.type === 'profile') {
    if(s.profile.id!==actor)throw new DomainError('FORBIDDEN','You can only edit your profile.',403);
    if(!command.name.trim()||command.name.trim().length>80||command.bio.length>1000||!['Beginner','Intermediate','Experienced'].includes(command.level)||command.gear.length>30||command.gear.some(g=>!g.trim()||g.length>100))throw new DomainError('INVALID_PROFILE','Check your name, bio, experience level, and gear list.');
    s.profile={...s.profile,name:command.name.trim(),bio:command.bio.trim(),level:command.level,gear:[...new Set(command.gear.map(g=>g.trim()))],initials:command.name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()};
    for(const p of s.posts)if(p.userId===actor){p.author=s.profile.name;p.initials=s.profile.initials;}
    for(const c of s.comments)if(c.userId===actor)c.author=s.profile.name;
    for(const t of s.trips)if(t.organizerId===actor)t.organizer=s.profile.name;
  } else if(command.type==='create-trip'){
    requireValue(s.treks.find(t=>t.id===command.trekId));
    if(command.visibility!==undefined&&!['public','private'].includes(command.visibility))throw new DomainError('INVALID_VISIBILITY','Choose public or private.');
    if(!command.title.trim()||command.title.length>120||!Number.isInteger(command.maxParticipants)||command.maxParticipants<2||command.maxParticipants>50)throw new DomainError('INVALID_TRIP','Use a title and a capacity between 2 and 50.');
    if(!Number.isFinite(Date.parse(command.startsAt))||Date.parse(command.startsAt)<=Date.parse(now))throw new DomainError('INVALID_DATE','Choose a future outing date.');
    try{new Intl.DateTimeFormat('en',{timeZone:command.timezone});}catch{throw new DomainError('INVALID_TIMEZONE','Choose a valid timezone.');}
    const existing=s.trips.find(t=>t.id===command.id);
    if(existing){if(existing.organizerId!==actor||existing.trekId!==command.trekId||existing.title!==command.title.trim()||Date.parse(existing.startsAt)!==Date.parse(command.startsAt)||existing.timezone!==command.timezone||existing.maxParticipants!==command.maxParticipants||(existing.visibility||'public')!==(command.visibility||'public'))throw new DomainError('CONFLICT','This request ID was already used.',409);return s;}
    s.trips.push({routeVersionId:s.treks.find(t=>t.id===command.trekId)?.routeVersionId,id:command.id,trekId:command.trekId,title:command.title.trim(),organizerId:actor,organizer:s.profile.name,startsAt:new Date(command.startsAt).toISOString(),timezone:command.timezone,visibility:command.visibility||'public',maxParticipants:command.maxParticipants,members:[{userId:actor,status:'accepted'}],status:'open'});
  } else if (command.type === 'save') {
    requireValue(s.treks.find(t=>t.id===command.trekId));
    const ids = new Set(s.saved[actor] || []);
    command.saved ? ids.add(command.trekId) : ids.delete(command.trekId);
    s.saved[actor] = [...ids];
  } else if (command.type === 'like') {
    const post = requireValue(s.posts.find(p=>p.id===command.postId));
    const ids = new Set(post.likedBy);
    command.liked ? ids.add(actor) : ids.delete(actor); post.likedBy = [...ids];
  } else if (command.type === 'post') {
    requireValue(s.treks.find(t=>t.id===command.trekId));
    if (!command.content.trim() || command.content.length > 5000) throw new DomainError('INVALID_CONTENT','Write between 1 and 5,000 characters.');
    if (!Number.isInteger(command.rating) || command.rating < 1 || command.rating > 5) throw new DomainError('INVALID_RATING','Choose a rating from 1 to 5.');
    if (!['Clear','Muddy','Snow','Blocked','Unknown'].includes(command.condition)) throw new DomainError('INVALID_CONDITION','Choose a listed condition.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(command.observedAt) || !Number.isFinite(Date.parse(command.observedAt)) || new Date(command.observedAt).toISOString().slice(0,10) !== command.observedAt || command.observedAt > now.slice(0,10)) throw new DomainError('INVALID_DATE','Choose a valid observation date, today or earlier.');
    const existing = s.posts.find(p=>p.id===command.id);
    if (existing) { if (existing.userId !== actor || existing.content !== command.content || existing.trekId !== command.trekId || existing.rating !== command.rating || existing.condition !== command.condition || existing.observedAt !== command.observedAt) throw new DomainError('CONFLICT','This request ID was already used for different content.',409); return s; }
    s.posts.unshift({ ...command, userId: actor, author: s.profile.name, initials: s.profile.initials, createdAt: now, likedBy: [] });
  } else if (command.type === 'comment') {
    requireValue(s.posts.find(p=>p.id===command.postId));
    if (!command.body.trim() || command.body.length > 1000) throw new DomainError('INVALID_CONTENT','Write between 1 and 1,000 characters.');
    const existing = s.comments.find(c=>c.id===command.id);
    if (existing) { if(existing.userId !== actor || existing.body !== command.body.trim() || existing.postId !== command.postId) throw new DomainError('CONFLICT','This request ID was already used for different content.',409); return s; }
    s.comments.push({ id: command.id, postId: command.postId, body: command.body.trim(), userId: actor, author: s.profile.name, createdAt: now });
  } else {
    const trip = requireValue(s.trips.find(t=>t.id===command.tripId));
    if(command.type==='cancel-trip'){
      if(trip.organizerId!==actor)throw new DomainError('FORBIDDEN','Only the organizer can cancel this outing.',403);
      trip.status='closed';
    } else if (command.type === 'leave') {
      if (trip.organizerId===actor) throw new DomainError('ORGANIZER_REQUIRED','The organizer cannot leave their own outing.');
      trip.members=trip.members.filter(m=>m.userId!==actor);
    } else if (command.type === 'join') {
      if (trip.members.some(m=>m.userId===actor)) return s;
      if(trip.visibility==='private')throw new DomainError('INVITATION_REQUIRED','An invitation is required for this outing.',403);
      if (trip.status!=='open' || trip.startsAt <= now) throw new DomainError('TRIP_CLOSED','This outing is not accepting requests.',409);
      if (trip.members.filter(m=>m.status==='accepted').length>=trip.maxParticipants) throw new DomainError('TRIP_FULL','This outing is full.',409);
      trip.members.push({ userId: actor, status: 'pending' });
    } else {
      if (trip.organizerId!==actor) throw new DomainError('FORBIDDEN','Only the organizer can approve requests.',403);
      const member=requireValue(trip.members.find(m=>m.userId===command.userId));
      if(member.status==='accepted') return s;
      if(trip.status!=='open' || trip.startsAt<=now) throw new DomainError('TRIP_CLOSED','This outing is closed.',409);
      if(trip.members.filter(m=>m.status==='accepted').length>=trip.maxParticipants) throw new DomainError('TRIP_FULL','This outing is full.',409);
      member.status='accepted';
    }
  }
  return s;
}
