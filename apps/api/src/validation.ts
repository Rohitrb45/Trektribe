import { z } from 'zod';
const uuid=z.uuid();
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('save'),trekId:uuid,saved:z.boolean()}).strict(),
 z.object({type:z.literal('like'),postId:uuid,liked:z.boolean()}).strict(),
 z.object({type:z.literal('post'),id:uuid,trekId:uuid,content:z.string().trim().min(1).max(5000),rating:z.number().int().min(1).max(5),condition:z.enum(['Clear','Muddy','Snow','Blocked','Unknown']),observedAt:z.iso.date()}).strict(),
 z.object({type:z.literal('comment'),id:uuid,postId:uuid,body:z.string().trim().min(1).max(1000)}).strict(),
 z.object({type:z.literal('join'),tripId:uuid}).strict(),
 z.object({type:z.literal('leave'),tripId:uuid}).strict(),
 z.object({type:z.literal('approve'),tripId:uuid,userId:uuid}).strict(),
 z.object({type:z.literal('profile'),name:z.string().trim().min(1).max(80),bio:z.string().max(1000),level:z.enum(['Beginner','Intermediate','Experienced']),gear:z.array(z.string().trim().min(1).max(100)).max(30)}).strict(),
 z.object({type:z.literal('create-trip'),id:uuid,trekId:uuid,title:z.string().trim().min(1).max(120),startsAt:z.iso.datetime({offset:true}),timezone:z.string().min(1).max(100),visibility:z.enum(['public','private']).default('public'),maxParticipants:z.number().int().min(2).max(50)}).strict(),
 z.object({type:z.literal('cancel-trip'),tripId:uuid}).strict(),
 z.object({type:z.literal('cohost'),tripId:uuid,userId:uuid,enabled:z.boolean()}).strict()
]);
export const searchSchema=z.object({q:z.string().max(100).default(''),difficulty:z.enum(['All','Easy','Moderate','Hard']).default('All'),lat:z.coerce.number().min(-90).max(90).optional(),lng:z.coerce.number().min(-180).max(180).optional(),radiusM:z.coerce.number().positive().max(100000).default(10000)}).strict().refine(v=>(v.lat===undefined)===(v.lng===undefined),'Provide both latitude and longitude.');
export const feedSchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(500).optional()}).strict();
