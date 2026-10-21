import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { threadInput,replyInput,forumPage } from '../apps/api/src/forums';

test('forum inputs reject forged authors, empty text and invalid pagination',()=>{
 const data={id:randomUUID(),title:' Advice ',body:' Trail tips '};
 assert.equal(threadInput.parse(data).title,'Advice');
 for(const patch of [{userId:randomUUID()},{title:' '},{body:'x'.repeat(5001)},{id:'invalid'}])assert.equal(threadInput.safeParse({...data,...patch}).success,false);
 assert.equal(replyInput.safeParse({id:randomUUID(),body:'x'.repeat(2001)}).success,false);
 for(const query of [{cursor:-1},{cursor:1.5},{limit:51},{limit:0},{cursor:'bad'},{userId:'spoof'}])assert.equal(forumPage.safeParse(query).success,false);
});
