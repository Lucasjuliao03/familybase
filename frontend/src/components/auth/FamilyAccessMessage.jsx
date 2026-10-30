import { useState } from 'react';
import { buildFamilyAccessMessage } from '../../lib/familyAccessMessage';

export default function FamilyAccessMessage({data}) {
  const [feedback,setFeedback]=useState('');
  const message=buildFamilyAccessMessage(data);
  const copy=async()=>{try {await navigator.clipboard.writeText(message);setFeedback('Mensagem copiada.');} catch {setFeedback('Selecione e copie a mensagem abaixo.');}};
  return <section className="family-confirmation" style={{textAlign:'left'}}><h3>Dados de acesso</h3><p><strong>Código:</strong> {data.familyCode}<br/><strong>Usuário:</strong> {data.username}</p><p>Revise a mensagem antes de compartilhar. A senha não está incluída.</p><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',lineHeight:1.6}}>{message}</pre><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="btn btn-ghost" onClick={copy}>Copiar mensagem</button><a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={'https://wa.me/?text='+encodeURIComponent(message)}>Abrir no WhatsApp</a></div>{feedback && <p role="status">{feedback}</p>}</section>;
}
