import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '../contexts/AuthContext';
import {supabase} from '../lib/supabase';
import {warmFamilyAssets,familyAssetUrl} from '../lib/familyAssets';
import {locationDeviceKey} from '../lib/locationTelemetry';
export function useFamilyLocations({familyId,enabled=true}) {
 const {user}=useAuth();const scope=`${familyId}/${user?.id||''}/${enabled}`;
 const current=useRef(scope);
 useLayoutEffect(()=>{current.current=scope;},[scope]);
 const [state,setState]=useState({scope:'',map:new Map()}),[loading,setLoading]=useState(true),[error,setError]=useState(null);
 if(state.scope!==scope){setState({scope,map:new Map()});setLoading(!!enabled&&!!familyId);}
 const inflight=useRef(null);
 const refresh=useCallback(async()=>{
  if(!enabled||!familyId||!user?.id)return;
  if(inflight.current?.scope===scope)return inflight.current.work;
  const work=(async()=>{
   try{
    const [locs,devices,profiles,children]=await Promise.all([
     supabase.from('family_locations').select('*').eq('family_id',familyId),supabase.from('family_member_devices').select('*').eq('family_id',familyId),
     supabase.from('users').select('id,name,role,avatar_url,avatar_preset,display_color').eq('family_id',familyId),
     supabase.from('children').select('user_id,name,avatar_url,avatar_preset,color').eq('family_id',familyId)]);
    if([locs,devices,profiles,children].some(r=>r.error))throw Error('Não foi possível atualizar as posições.');
    await warmFamilyAssets(supabase,[...(profiles.data||[]),...(children.data||[])].map(r=>r.avatar_url));
    if(current.current!==scope)return;
    const users=new Map((profiles.data||[]).map(p=>[p.id,p])),kids=new Map((children.data||[]).map(c=>[c.user_id,c])),devs=new Map((devices.data||[]).map(d=>[locationDeviceKey(d),d]));
    const map=new Map((locs.data||[]).filter(r=>devs.get(locationDeviceKey(r))?.is_location_enabled!==false).map(row=>{
     const p=users.get(row.user_id)||{},c=kids.get(row.user_id),avatar=c?.avatar_preset?null:c?.avatar_url||p.avatar_url;
     return[locationDeviceKey(row),{...row,device:devs.get(locationDeviceKey(row)),users:{...p,name:c?.name||p.name,avatar_preset:c?.avatar_preset||p.avatar_preset,avatar_url:avatar?familyAssetUrl(avatar):null,display_color:c?.color||p.display_color}}];
    }));
    setState({scope,map});setError(null);
   }catch(e){if(current.current===scope)setError(e.message);}finally{if(current.current===scope)setLoading(false);}
  })();inflight.current={scope,work};try{await work;}finally{if(inflight.current?.work===work)inflight.current=null;}
 },[familyId,user?.id,enabled,scope]);
 useEffect(()=>{
  if(!enabled||!familyId)return;
  void refresh();
  const channel=supabase.channel(`web-locations-${familyId}-${Date.now()}`).on('postgres_changes',{schema:'public',table:'family_locations',event:'*',filter:`family_id=eq.${familyId}`},()=>void refresh()).subscribe();
  const timer=setInterval(()=>void refresh(),30_000);
  return()=>{clearInterval(timer);void supabase.removeChannel(channel);};
 },[familyId,enabled,scope,refresh]);
 return{locations:enabled&&state.scope===scope?state.map:new Map(),loading,error,refresh};
}
