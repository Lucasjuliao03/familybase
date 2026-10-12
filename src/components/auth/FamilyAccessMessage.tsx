import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { buildFamilyAccessMessage } from '../../lib/familyAccessMessage';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Colors } from '../../theme';

export type AccessMessageData = {name: string; familyName: string; familyCode: string; username: string};
export function FamilyAccessMessage({data}: {data: AccessMessageData}) {
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const [busy,setBusy]=useState(false);
  let message='';
  try {message=buildFamilyAccessMessage(data);} catch { /* Wait for real identifiers. */ }
  const share=async()=>{try {setBusy(true);setError('');await Share.share({message,title:'Acesso ao Tudo de Família'});} catch {setError('Não foi possível abrir o compartilhamento. Você pode selecionar e copiar a mensagem.');} finally {setBusy(false);}};
  const copy=async()=>{try {setBusy(true);setError('');if (!(await Clipboard.setStringAsync(message))) throw new Error('Clipboard unavailable');setCopied(true);} catch {setError('Não foi possível copiar automaticamente. Selecione o texto da mensagem para copiar.');} finally {setBusy(false);}};
  return <View style={{gap:12,padding:16,borderRadius:18,backgroundColor:Colors.primaryLighter}}>
    <Text accessibilityRole="header" style={{fontWeight:'800',fontSize:18,color:Colors.text}}>Dados de acesso</Text>
    <Text selectable style={{fontWeight:'700',color:Colors.text}}>Código: {data.familyCode}{'\n'}Usuário: {data.username}</Text>
    <Text style={{color:Colors.textSecondary}}>Mensagem pronta para compartilhar. Revise e selecione o WhatsApp; a senha não será incluída.</Text>
    {!!message && <Text selectable style={{color:Colors.text,lineHeight:21}}>{message}</Text>}
    <PrimaryButton label={copied?'Mensagem copiada':'Copiar mensagem'} variant="outline" onPress={copy} disabled={!message || busy}/>
    <PrimaryButton label="Compartilhar mensagem" onPress={share} disabled={!message || busy}/>
    {copied && <Text accessibilityLiveRegion="polite" style={{color:Colors.textSecondary}}>Cole a mensagem na conversa desejada.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{color:Colors.danger}}>{error}</Text>}
  </View>;
}
