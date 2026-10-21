import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createSeed, DEMO_USER, withReportRatings } from '../packages/core/src/index';

test('report averages replace sample totals without mutating input, including unrated trails',()=>{
  const state=createSeed(),trekId=state.treks[0].id;
  state.posts=[5,4,4].map((rating,i)=>({...state.posts[0],id:`report-${i}`,trekId,rating}));
  state.treks[0].rating=1;state.treks[0].reports=999;
  const result=withReportRatings(state);
  assert.equal(result.treks[0].rating,4.3);assert.equal(result.treks[0].reports,3);
  assert.equal(result.treks[1].rating,0);assert.equal(result.treks[1].reports,0);
  assert.equal(state.treks[0].reports,999);
});

test('publishing updates ratings and duplicate retries or rejected reports cannot inflate totals',()=>{
  const state=createSeed();state.posts=[];
  const command={type:'post' as const,id:'rating-report',trekId:state.treks[0].id,content:'First visit',rating:2,condition:'Clear',observedAt:'2020-01-01'};
  const first=applyCommand(withReportRatings(state),command,DEMO_USER);
  const duplicate=applyCommand(first,command,DEMO_USER);
  assert.equal(duplicate.treks[0].rating,2);assert.equal(duplicate.treks[0].reports,1);
  const next=applyCommand(duplicate,{...command,id:'second-report',rating:5},DEMO_USER);
  assert.equal(next.treks[0].rating,3.5);assert.equal(next.treks[0].reports,2);
  assert.throws(()=>applyCommand(next,{...command,id:'bad-report',rating:6},DEMO_USER));
  assert.equal(next.treks[0].reports,2);
});
