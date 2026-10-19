import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { apiUrl, makeId } from './data';
import { accessToken, authenticatedMode } from './session';
type Message={id:string;sequence:number;author:string;body:string};
type Reply={ok:boolean;error?:string;items?:Message[];hasMore?:boolean;nextSequence?:number};

export function TripChat({tripId,onClose}:{tripId:string;onClose:()=>void}){
  const [messages,setMessages]=useState<Message[]>([]),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false);
  const socket=useRef<Socket|null>(null),offset=useRef(0),pending=useRef<{body:string;id:string}|null>(null);
  useEffect(()=>{
    let active=true,syncing=false;
    offset.current=0;pending.current=null;setMessages([]);setBody('');setError('');
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
    client.on('connect',()=>{setConnected(true);sync();});
    client.on('disconnect',()=>setConnected(false));
    client.on('connect_error',()=>{setMessages([]);offset.current=0;setError('Conversation connection failed. Check your session and API.');});
    client.on('trip:changed',(event:{tripId:string})=>{if(event.tripId===tripId)sync();});
    client.connect();
    const timer=setInterval(sync,5000);
    return()=>{active=false;clearInterval(timer);client.disconnect();socket.current=null;};
  },[tripId]);
  const send=async()=>{
    if(!socket.current?.connected)return;
    const text=body.trim();if(pending.current?.body!==text)pending.current={body:text,id:makeId()};
    setBusy(true);
    try{
      const reply:Reply=await socket.current.timeout(10000).emitWithAck('trip:send',{tripId,...pending.current});
      if(!reply.ok)throw new Error(reply.error);
      setBody('');pending.current=null;setError('');
    }catch(e){setError((e as Error).message||'Send not confirmed. Retry to safely resend the same message.');}finally{setBusy(false);}
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={{flex:1,padding:24,paddingTop:60,backgroundColor:'#f8f7f0',gap:12}}>
    <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:24,fontWeight:'700'}}>Outing conversation</Text><Button title="Close" onPress={onClose}/></View>
    <Text>{connected?'Connected':'Reconnecting…'}</Text><ScrollView style={{flex:1}}>{messages.map(m=><View key={m.id} style={{padding:14,marginBottom:10,backgroundColor:'white',borderRadius:8}}><Text style={{fontWeight:'700'}}>{m.author}</Text><Text selectable>{m.body}</Text></View>)}</ScrollView>
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}
    <TextInput accessibilityLabel="Message to outing" editable={!busy} multiline maxLength={2000} value={body} onChangeText={setBody} placeholder="Plan with your group…" style={{padding:12,borderWidth:1,borderColor:'#a2b1a5',borderRadius:8,minHeight:60}}/>
    <Button title={busy?'Sending…':'Send message'} disabled={busy||!connected||!body.trim()} onPress={send}/>
  </View></Modal>;
}
