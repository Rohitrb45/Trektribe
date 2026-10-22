import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Button, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatDraft, ChatDrafts, draftKey } from './chat-drafts';
import { io, Socket } from 'socket.io-client';
import { apiUrl, makeId } from './data';
import { accessToken, authenticatedMode } from './session';
type Message={id:string;sequence:number;author:string;body:string};
type Reply={ok:boolean;error?:string;items?:Message[];hasMore?:boolean;nextSequence?:number};

export function TripChat({tripId,userId,onClose}:{tripId:string;userId:string;onClose:()=>void}){
  return <Conversation key={`${apiUrl}:${userId}:${tripId}`} tripId={tripId} userId={userId} onClose={onClose}/>;
}
function Conversation({tripId,userId,onClose}:{tripId:string;userId:string;onClose:()=>void}){
  const drafts=useMemo(()=>new ChatDrafts(AsyncStorage,draftKey(apiUrl!,userId,tripId)),[tripId,userId]);
  const currentDraft=useRef<ChatDraft|null>(null),mounted=useRef(true),saveVersion=useRef(0);
  const [draftReady,setDraftReady]=useState(false),[draftError,setDraftError]=useState(''),[draftStatus,setDraftStatus]=useState('Loading saved draft...');
  useEffect(()=>{
    let active=true;mounted.current=true;
    drafts.load().then(draft=>{if(active){currentDraft.current=draft;setBody(draft?.body??'');setDraftReady(true);setDraftStatus(draft?'Draft restored on this device.':'');}}).catch(()=>{if(active)setDraftError('Could not load your saved draft. Retry or discard it to continue.');});
    return()=>{active=false;mounted.current=false;};
  },[drafts]);
  async function saveDraft(draft:ChatDraft){
    const version=++saveVersion.current;setDraftStatus('Saving draft...');setDraftError('');
    try{await drafts.save(draft);if(mounted.current&&version===saveVersion.current)setDraftStatus('Draft saved on this device.');}
    catch(e){if(mounted.current&&version===saveVersion.current){setDraftStatus('');setDraftError('Draft could not be saved. Your text is still here; retry before closing.');}throw e;}
  }
  function editBody(text:string){
    const id=currentDraft.current?.body.trim()===text.trim()?currentDraft.current.id:makeId();
    const draft:ChatDraft={version:1,id,body:text};currentDraft.current=draft;setBody(text);void saveDraft(draft).catch(()=>{});
  }
  async function discard(){
    setBusy(true);
    try{await drafts.discard();currentDraft.current=null;setBody('');setDraftReady(true);setDraftError('');setDraftStatus('Draft discarded.');}
    catch{setDraftError('Could not discard the saved draft. Please retry.');}finally{setBusy(false);}
  }
  async function close(){
    if(busy)return;setBusy(true);
    try{if(currentDraft.current)await saveDraft(currentDraft.current);onClose();}catch{}finally{if(mounted.current)setBusy(false);}
  }
  const [online,setOnline]=useState<{id:string;name:string}[]|null>(null);
  const [messages,setMessages]=useState<Message[]>([]),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false);
  const socket=useRef<Socket|null>(null),offset=useRef(0);
  useEffect(()=>{
    let active=true,syncing=false,presenceBusy=false,foreground=AppState.currentState==='active';
    setOnline(null);
    offset.current=0;setMessages([]);setError('');
    const client=io(apiUrl!,{autoConnect:false,auth:callback=>{try{callback({token:authenticatedMode?accessToken():'trektribe-local-demo'});}catch{setError('Session expired. Sign out and sign in again.');callback({token:''});}}});
    socket.current=client;
    const sync=async()=>{
      if(syncing||!client.connected)return;
      syncing=true;
      try{
        let more=true;
        while(more&&active){
          const reply:Reply=await client.timeout(10000).emitWithAck('trip:sync',{tripId,after:offset.current});
          if(!active)return;
          if(!reply.ok){setMessages([]);offset.current=0;throw new Error(reply.error);}
          const batch=reply.items||[];
          if(active){setMessages(current=>{const merged=new Map(current.map(m=>[m.id,m]));for(const m of batch)merged.set(m.id,m);return [...merged.values()].sort((a,b)=>a.sequence-b.sequence);});offset.current=reply.nextSequence??offset.current;}
          more=!!reply.hasMore;
        }
        if(active)setError('');
      }catch(e){if(active)setError((e as Error).message||'Could not refresh messages.');}finally{syncing=false;}
    };
    const pulse=async()=>{
      if(!active||!foreground||!client.connected||presenceBusy)return;
      presenceBusy=true;
      try{const reply:{ok:boolean;online?:{id:string;name:string}[]}=await client.timeout(5000).emitWithAck('trip:presence',{tripId});if(active&&foreground)setOnline(reply.ok?reply.online??[]:null);}
      catch{if(active)setOnline(null);}finally{presenceBusy=false;}
    };
    const appState=AppState.addEventListener('change',state=>{foreground=state==='active';if(foreground)void pulse();else{setOnline(null);client.emit('trip:away');}});
    client.on('connect',()=>{setConnected(true);sync();void pulse();});
    client.on('disconnect',()=>{setConnected(false);setOnline(null);});
    client.on('connect_error',()=>{setMessages([]);offset.current=0;setError('Conversation connection failed. Check your session and API.');});
    client.on('trip:changed',(event:{tripId:string})=>{if(event.tripId===tripId)sync();});
    client.connect();
    const timer=setInterval(sync,5000);
    const presenceTimer=setInterval(pulse,10000);
    return()=>{active=false;clearInterval(timer);clearInterval(presenceTimer);appState.remove();client.disconnect();socket.current=null;};
  },[tripId]);
  const send=async()=>{
    if(!socket.current?.connected||!draftReady||!currentDraft.current?.body.trim())return;
    const draft=currentDraft.current;
    setBusy(true);
    try{
      // Persist the request ID before sending: an interrupted acknowledgment can retry safely.
      await saveDraft(draft);
      const reply:Reply=await socket.current.timeout(10000).emitWithAck('trip:send',{tripId,id:draft.id,body:draft.body.trim()});
      if(!reply.ok)throw new Error(reply.error);
      await drafts.acknowledge(draft.id);
      if(mounted.current){setBody('');currentDraft.current=null;setDraftStatus('Message sent; saved draft cleared.');setDraftError('');setError('');}
    }catch(e){if(mounted.current)setError((e as Error).message||'Send not confirmed. Retry to safely resend the same message.');}finally{if(mounted.current)setBusy(false);}
  };
  return <Modal visible animationType="slide" onRequestClose={()=>void close()}><View style={{flex:1,padding:24,paddingTop:60,backgroundColor:'#f8f7f0',gap:12}}>
    <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:24,fontWeight:'700'}}>Outing conversation</Text><Button title="Close" disabled={busy} onPress={()=>void close()}/></View>
    <Text accessibilityLiveRegion="polite">{online===null?'Active participants unavailable':`Active in this conversation: ${online.map(p=>p.name).join(', ')||'Nobody'}`}</Text>
    <Text>{connected?'Connected':'Reconnecting…'}</Text><ScrollView style={{flex:1}}>{messages.map(m=><View key={m.id} style={{padding:14,marginBottom:10,backgroundColor:'white',borderRadius:8}}><Text style={{fontWeight:'700'}}>{m.author}</Text><Text selectable>{m.body}</Text></View>)}</ScrollView>
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}
    {!!draftError&&<Text accessibilityRole="alert">{draftError}</Text>}
    {!!draftStatus&&<Text accessibilityLiveRegion="polite">{draftStatus}</Text>}
    {!!draftError&&<Button title="Retry draft storage" disabled={busy} onPress={()=>{if(currentDraft.current)void saveDraft(currentDraft.current).catch(()=>{});else{setBusy(true);drafts.load().then(d=>{currentDraft.current=d;setBody(d?.body??'');setDraftReady(true);setDraftError('');setDraftStatus(d?'Draft restored on this device.':'');}).catch(()=>setDraftError('Draft could not be loaded. Retry or discard it.')).finally(()=>setBusy(false));}}}/>}
    {(!!body||!!draftError)&&<Button title="Discard draft" disabled={busy} onPress={()=>void discard()}/>}
    <TextInput accessibilityLabel="Message to outing" editable={!busy&&draftReady} multiline maxLength={2000} value={body} onChangeText={editBody} placeholder="Plan with your group…" style={{padding:12,borderWidth:1,borderColor:'#a2b1a5',borderRadius:8,minHeight:60}}/>
    <Button title={busy?'Sending…':'Send message'} disabled={busy||!draftReady||!connected||!body.trim()} onPress={send}/>
  </View></Modal>;
}
