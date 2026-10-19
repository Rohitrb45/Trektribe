import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { listBlocks, setBlock } from './data';

export function BlockSettings({onClose,onChanged}:{onClose:()=>void;onChanged:()=>void}){
  const [items,setItems]=useState<{id:string;name:string}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  useEffect(()=>{listBlocks().then(r=>setItems(r.items)).catch(e=>setError(e.message)).finally(()=>setBusy(false));},[]);
  async function unblock(id:string){
    setBusy(true);setError('');
    try{await setBlock(id,false);setItems((await listBlocks()).items);onChanged();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal transparent animationType="slide" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#0008',justifyContent:'center',padding:24}}><ScrollView style={{backgroundColor:'#fcfcf7',borderRadius:16}} contentContainerStyle={{padding:24,gap:20}}>
    <Text style={{fontSize:24}}>Blocked people</Text>
    <Text>Blocking hides reports, comments and conversation messages between you and prevents new interactions. Existing outing memberships remain. Unblocking only removes your own block.</Text>
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}
    {busy&&<Text>Loading...</Text>}
    {!busy&&!error&&!items.length&&<Text>You have not blocked anyone.</Text>}
    {items.map(person=><View key={person.id} style={{gap:8}}><Text>{person.name}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>unblock(person.id)} style={{padding:12,backgroundColor:'#e8edde'}}><Text>Unblock {person.name}</Text></Pressable></View>)}
    <Pressable accessibilityRole="button" onPress={onClose} style={{padding:12}}><Text>Close</Text></Pressable>
  </ScrollView></View></Modal>;
}
