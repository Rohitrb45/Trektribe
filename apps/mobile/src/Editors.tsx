import React, { useRef, useState } from 'react';
import { Button, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { Command, Profile, Trek } from '@trektribe/core';
import { makeId } from './data';

type Actions = { busy: boolean; onClose: () => void; onSubmit: (command: Command) => Promise<boolean> };
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible animationType="slide" onRequestClose={onClose}><ScrollView contentContainerStyle={{padding:28,paddingTop:60,gap:18,backgroundColor:'#f8f7f0',flexGrow:1}} keyboardShouldPersistTaps="handled">
    <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:24,fontWeight:'700'}}>{title}</Text><Button title="Close" onPress={onClose}/></View>{children}
  </ScrollView></Modal>;
}
function Field({ label, value, onChange, multiline=false }: { label: string; value: string; onChange: (value:string)=>void; multiline?:boolean }) {
  return <View style={{gap:8}}><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} style={{borderWidth:1,borderColor:'#a2b1a5',borderRadius:8,padding:12,minHeight:multiline?100:48,backgroundColor:'white'}}/></View>;
}
export function ProfileEditor({ profile, busy, onClose, onSubmit }: Actions & { profile: Profile }) {
  const [name,setName]=useState(profile.name),[bio,setBio]=useState(profile.bio),[level,setLevel]=useState(profile.level),[gear,setGear]=useState(profile.gear.join('\n')),[error,setError]=useState('');
  return <Sheet title="Edit profile" onClose={onClose}><Field label="Display name" value={name} onChange={setName}/><Field label="About you" value={bio} onChange={setBio} multiline/>
    <Text>Experience level</Text>{['Beginner','Intermediate','Experienced'].map(v=><Button key={v} title={`${level===v?'✓ ':''}${v}`} onPress={()=>setLevel(v)}/>)}
    <Field label="Gear (one item per line)" value={gear} onChange={setGear} multiline/>{!!error&&<Text accessibilityRole="alert">{error}</Text>}
    <Button title="Save profile" disabled={busy||!name.trim()} onPress={async()=>{const ok=await onSubmit({type:'profile',name,bio,level,gear:gear.split('\n').map(g=>g.trim()).filter(Boolean)});if(ok)onClose();else setError('Could not save. Check your details and try again.');}}/>
  </Sheet>;
}
export function TripEditor({ treks, busy, onClose, onSubmit }: Actions & { treks: Trek[] }) {
  const [title,setTitle]=useState(''),[trekId,setTrekId]=useState(treks[0]?.id||''),[date,setDate]=useState(''),[time,setTime]=useState('08:00'),[capacity,setCapacity]=useState('6'),[error,setError]=useState('');
  const pending=useRef<{key:string;id:string}|null>(null);
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const submit=async()=>{
    const start=new Date(`${date}T${time}:00`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!Number.isFinite(start.getTime())||start.getTime()<=Date.now()||start.getFullYear()!==Number(date.slice(0,4))||start.getMonth()+1!==Number(date.slice(5,7))||start.getDate()!==Number(date.slice(8,10))||start.getHours()!==Number(time.slice(0,2))||start.getMinutes()!==Number(time.slice(3,5))){setError('Enter a valid future date and time.');return;}
    const body={trekId,title,startsAt:start.toISOString(),timezone,maxParticipants:Number(capacity)};
    const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:makeId()};
    if(await onSubmit({type:'create-trip',id:pending.current.id,...body}))onClose();else setError('Could not create the outing. Check the title and capacity (2–50), then retry.');
  };
  return <Sheet title="Plan an outing" onClose={onClose}><Field label="Outing title" value={title} onChange={setTitle}/><Text>Trail</Text>
    {treks.map(t=><Button key={t.id} title={`${trekId===t.id?'✓ ':''}${t.title}`} onPress={()=>setTrekId(t.id)}/>)}
    <Field label="Date (YYYY-MM-DD)" value={date} onChange={setDate}/><Field label="Time (HH:mm)" value={time} onChange={setTime}/><Text>Time zone: {timezone}. This outing is visible to other users.</Text>
    <Field label="Total places, including you" value={capacity} onChange={setCapacity}/>{!!error&&<Text accessibilityRole="alert">{error}</Text>}
    <Button title="Create outing" disabled={busy||!title.trim()||!trekId} onPress={submit}/>
  </Sheet>;
}
