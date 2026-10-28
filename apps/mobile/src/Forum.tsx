import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { ForumThread, ForumReply, forumThreads, forumThread, createForumThread, replyToForum, closeForumThread, forumCapabilities, makeId } from './data';

import { ForumActions, ForumModeration } from './ForumActions';

export function Forum({userId,onClose}:{userId:string;onClose:()=>void}){
 const [threads,setThreads]=useState<ForumThread[]>([]),[thread,setThread]=useState<ForumThread|null>(null),[replies,setReplies]=useState<ForumReply[]>([]);
 const [cursor,setCursor]=useState<number|null>(null),[replyCursor,setReplyCursor]=useState<number|null>(null);
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[reply,setReply]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [moderator,setModerator]=useState(false),[moderation,setModeration]=useState(false);
 const pending=useRef<{key:string;id:string}|null>(null);
 function requestId(key:string){if(pending.current?.key!==key)pending.current={key,id:makeId()};return pending.current!.id;}
 async function work(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function list(more=false){const page=await forumThreads(more?cursor??0:0);setThreads(old=>more?[...old,...page.items]:page.items);setCursor(page.nextCursor);}
 async function open(id:string,more=false){
   try{const page=await forumThread(id,more?replyCursor??0:0);setThread(page.thread);setReplies(old=>more?[...old,...page.items]:page.items);setReplyCursor(page.nextCursor);}
   catch(e){setThread(null);setReplies([]);throw e;}
 }
 useEffect(()=>{void work(async()=>{setModerator((await forumCapabilities()).moderator);await list();});},[]);
 return <Modal animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><View style={{flex:1,padding:24,paddingTop:60,backgroundColor:'#f8f8f2',gap:12}}>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:24,fontWeight:'700'}}>Community discussions</Text><Button title="Close" disabled={busy} onPress={onClose}/></View>
   {!!error&&<Text accessibilityRole="alert" style={{color:'#842f24'}}>{error}</Text>}
   {busy&&<Text>Loading...</Text>}{moderator&&<Button title="Moderation reports" onPress={()=>setModeration(true)}/>}
   {moderation&&<ForumModeration onClose={()=>{setModeration(false);setThread(null);setReplies([]);void work(()=>list());}}/>}
   <ScrollView contentContainerStyle={{gap:16,paddingBottom:24}}>
   {thread?<>
     <Button title="Back to discussions" disabled={busy} onPress={()=>{setThread(null);setReplies([]);setReply('');void work(()=>list());}}/>
     <Text style={{fontSize:22,fontWeight:'600'}}>{thread.title}</Text><Text>By {thread.author}{thread.closed?' · Closed':''}</Text><Text selectable>{thread.body}</Text>
     <ForumActions key={thread.id+'-'+thread.revision} kind="threads" item={thread} userId={userId} onChanged={async()=>{setThread(null);setReplies([]);await list();}}/>
     <Button title="Refresh discussion" disabled={busy} onPress={()=>void work(()=>open(thread.id))}/>
     {thread.userId===userId&&<Button title={thread.closed?'Reopen discussion':'Close discussion'} disabled={busy} onPress={()=>void work(async()=>{await closeForumThread(thread.id,!thread.closed);await open(thread.id);})}/>}
     {replies.map(r=><View key={r.id} style={{backgroundColor:'white',padding:16,gap:8}}><Text style={{fontWeight:'600'}}>{r.author}</Text><Text selectable>{r.body}</Text><ForumActions key={r.id+'-'+r.revision} kind="replies" item={r} userId={userId} onChanged={()=>open(thread.id)}/></View>)}
     {!replies.length&&<Text>No replies yet.</Text>}
     {replyCursor!==null&&<Button title="More replies" disabled={busy} onPress={()=>void work(()=>open(thread.id,true))}/>}
     {!thread.closed&&<><TextInput accessibilityLabel="Discussion reply" editable={!busy} multiline maxLength={2000} value={reply} onChangeText={setReply} placeholder="Write a reply" style={{padding:14,borderWidth:1,minHeight:90}}/>
     <Button title="Send reply" disabled={busy||!reply.trim()} onPress={()=>void work(async()=>{await replyToForum(thread.id,{id:requestId(JSON.stringify(['reply',thread.id,reply])),body:reply});pending.current=null;setReply('');await open(thread.id);})}/></>}
   </>:<>
     <Text>Ask about trails, share advice, and plan together.</Text><Button title="Refresh discussions" disabled={busy} onPress={()=>void work(()=>list())}/>
     {threads.map(t=><View key={t.id} style={{padding:16,backgroundColor:'white',gap:8}}><Text>{t.author}{t.closed?' · Closed':''}</Text><Button title={t.title} disabled={busy} onPress={()=>void work(()=>open(t.id))}/></View>)}
     {!busy&&!threads.length&&!error&&<Text>No discussions yet. Start one below.</Text>}
     {cursor!==null&&<Button title="More discussions" disabled={busy} onPress={()=>void work(()=>list(true))}/>}
     <Text style={{fontSize:20}}>Start a discussion</Text>
     <TextInput accessibilityLabel="Discussion title" editable={!busy} maxLength={120} value={title} onChangeText={setTitle} placeholder="Title" style={{padding:14,borderWidth:1}}/>
     <TextInput accessibilityLabel="Discussion body" editable={!busy} multiline maxLength={5000} value={body} onChangeText={setBody} placeholder="What would you like to discuss?" style={{padding:14,borderWidth:1,minHeight:110}}/>
     <Button title="Publish discussion" disabled={busy||!title.trim()||!body.trim()} onPress={()=>void work(async()=>{const result=await createForumThread({id:requestId(JSON.stringify(['thread',title,body])),title,body});pending.current=null;setTitle('');setBody('');await list();await open(result.id);})}/>
   </>}
   </ScrollView>
 </View></Modal>;
}
