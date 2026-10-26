import React,{useState,useEffect} from 'react';
import { Button,Text,TextInput,View,ScrollView,Modal } from 'react-native';
import { changeForum,ForumReport,forumQueue,decideForum } from './data';

export function ForumActions({kind,item,userId,onChanged}:{kind:'threads'|'replies';item:{id:string;userId:string;body:string;title?:string;revision:number};userId:string;onChanged:()=>Promise<void>}){
 const [action,setAction]=useState<'edit'|'remove'|'report'|null>(null),[body,setBody]=useState(''),[title,setTitle]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(){
   if(!action)return;setBusy(true);setError('');
   try{if(action==='report')await changeForum({kind,id:item.id,action,data:{reason}});else if(action==='remove')await changeForum({kind,id:item.id,action,data:{revision:item.revision}});else if(kind==='threads')await changeForum({kind,id:item.id,action,data:{revision:item.revision,body,title}});else await changeForum({kind,id:item.id,action,data:{revision:item.revision,body}});setAction(null);await onChanged();}
   catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <View style={{gap:8}}>
   {!action?<>{item.userId===userId&&<><Button title="Edit" onPress={()=>{setTitle(item.title??'');setBody(item.body);setError('');setAction('edit');}}/><Button title="Delete" onPress={()=>{setError('');setAction('remove');}}/></>}<Button title="Report content" onPress={()=>{setReason('');setError('');setAction('report');}}/></>:<>
     {action==='edit'&&<>{kind==='threads'&&<TextInput accessibilityLabel="Edit discussion title" value={title} onChangeText={setTitle} editable={!busy} maxLength={120} style={{borderWidth:1,padding:12}}/>}<TextInput accessibilityLabel="Edit forum content" value={body} onChangeText={setBody} editable={!busy} multiline maxLength={kind==='threads'?5000:2000} style={{borderWidth:1,padding:12,minHeight:90}}/></>}
     {action==='report'&&<TextInput accessibilityLabel="Reason for reporting" placeholder="Why are you reporting this content?" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={1000} style={{borderWidth:1,padding:12}}/>}
     {action==='remove'&&<Text>Delete this {kind==='threads'?'discussion and hide its replies':'reply'}? It will disappear from the forum; retained records remain available for moderation review.</Text>}
     <Button title={action==='remove'?'Confirm deletion':action==='report'?'Submit report':'Save changes'} disabled={busy||(action==='edit'&&(!body.trim()||(kind==='threads'&&!title.trim())))||(action==='report'&&!reason.trim())} onPress={()=>void submit()}/>
     <Button title="Cancel" disabled={busy} onPress={()=>setAction(null)}/>
   </>}
   {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 </View>;
}

export function ForumModeration({onClose}:{onClose:()=>void}){
 const [items,setItems]=useState<ForumReport[]>([]),[cursor,setCursor]=useState<number|null>(null),[reason,setReason]=useState(''),[selected,setSelected]=useState<number|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function load(more=false){const page=await forumQueue(more?cursor??0:0);setItems(old=>more?[...old,...page.items]:page.items);setCursor(page.nextCursor);}
 useEffect(()=>{void work(()=>load());},[]);
 return <Modal onRequestClose={onClose} animationType="slide"><ScrollView contentContainerStyle={{padding:24,paddingTop:60,gap:16}}>
   <Text style={{fontSize:24}}>Moderation reports</Text><Button title="Close moderation" disabled={busy} onPress={onClose}/><Button title="Refresh reports" disabled={busy} onPress={()=>void work(()=>load())}/>
   {!!error&&<Text accessibilityRole="alert">{error}</Text>}{!items.length&&!busy&&!error&&<Text>No open reports.</Text>}
   {items.map(r=><View key={r.id} style={{padding:16,gap:10,backgroundColor:'#eee'}}><Text style={{fontWeight:'700'}}>{r.title}</Text><Text>Content when reported: {r.reportedTitle}</Text><Text selectable>{r.reportedBody}</Text><Text>Current content:</Text><Text selectable>{r.body}</Text><Text>Reported: {r.reason}</Text>{r.removed&&<Text>Content is already removed.</Text>}
     {selected!==r.id?<Button title="Review report" disabled={busy} onPress={()=>{setSelected(r.id);setReason('');}}/>:<><TextInput accessibilityLabel="Moderation decision reason" multiline maxLength={1000} value={reason} onChangeText={setReason} editable={!busy} style={{borderWidth:1,padding:12}}/>{(['dismiss','remove'] as const).map(action=><Button key={action} title={action==='dismiss'?'Dismiss report':'Remove reported content'} disabled={busy||!reason.trim()} onPress={()=>void work(async()=>{await decideForum(r.id,action,reason);setSelected(null);await load();})}/>)}</>}
   </View>)}
   {cursor!==null&&<Button title="More reports" disabled={busy} onPress={()=>void work(()=>load(true))}/>}
 </ScrollView></Modal>;
}
