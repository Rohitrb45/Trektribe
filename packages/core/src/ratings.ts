import { State } from './types';

/** Each persisted report contributes one vote; repeated authors may report new visits. */
export function withReportRatings(state:State):State {
  const totals=new Map<string,{sum:number;count:number}>();
  for(const post of state.posts){
    const total=totals.get(post.trekId)??{sum:0,count:0};
    total.sum+=post.rating;total.count++;totals.set(post.trekId,total);
  }
  return {...state,treks:state.treks.map(t=>{
    const total=totals.get(t.id);
    return {...t,rating:total?Math.round(total.sum/total.count*10)/10:0,reports:total?.count??0};
  })};
}
