import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { threadInput,replyInput,forumPage } from '../apps/api/src/forums';
import { editThread,editReply,removeInput,reportInput,decisionInput } from '../apps/api/src/forum-management';

test('forum management rejects forged roles, stale-version omissions and empty reasons',()=>{
 assert.equal(editThread.safeParse({title:'Title',body:'Text'}).success,false);
 assert.equal(editReply.safeParse({revision:1,body:'Text',userId:randomUUID()}).success,false);
 assert.equal(removeInput.safeParse({revision:0}).success,false);
 assert.equal(reportInput.safeParse({reason:' '}).success,false);
 assert.equal(decisionInput.safeParse({action:'remove',reason:'Spam',moderator:true}).success,false);
 assert.equal(decisionInput.safeParse({action:'restore',reason:'Changed mind'}).success,false);
});

test('forum inputs reject forged authors, empty text and invalid pagination',()=>{
 const data={id:randomUUID(),title:' Advice ',body:' Trail tips '};
 assert.equal(threadInput.parse(data).title,'Advice');
 for(const patch of [{userId:randomUUID()},{title:' '},{body:'x'.repeat(5001)},{id:'invalid'}])assert.equal(threadInput.safeParse({...data,...patch}).success,false);
 assert.equal(replyInput.safeParse({id:randomUUID(),body:'x'.repeat(2001)}).success,false);
 for(const query of [{cursor:-1},{cursor:1.5},{limit:51},{limit:0},{cursor:'bad'},{userId:'spoof'}])assert.equal(forumPage.safeParse(query).success,false);
});
