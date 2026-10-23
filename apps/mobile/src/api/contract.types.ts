import type { Comment, Post, Profile, Trek, Trip } from '@trektribe/core';
import type { components } from './schema';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// Fail the normal mobile typecheck if either the core model or the schema drifts.
export type CoreContractChecks = [
  Assert<Same<Profile, components['schemas']['Profile']>>,
  Assert<Same<Trek, components['schemas']['Trek']>>,
  Assert<Same<Trip, components['schemas']['Trip']>>,
  Assert<Same<Post, components['schemas']['Post']>>,
  Assert<Same<Comment, components['schemas']['Comment']>>,
];
