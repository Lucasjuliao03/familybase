import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webAdmin } from '../../services/webAdmin';
import { MASTER_SECTIONS, WEB_MODULES, roleLabel } from '../../lib/webNavigation';
import PromotionalPrice from '../../components/web/PromotionalPrice';

const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const status = value => ({ active:'Ativo', inactive:'Suspenso', trial:'Experiência', grace_period:'Carência', cancelled:'Renovação cancelada', on_hold:'Pagamento em atenção', paused:'Pausado', pending:'Pendente', expired:'Expirado' })[value] || value || '—';
const columns = {
  families: [['name','Família'],['member_count','Membros'],['status','Acesso',status],['subscription_status','Assinatura',status],['created_at','Cadastro',date]],
  users: [['name','Nome'],['family_name','Família'],['role','Perfil',(_,row) => roleLabel(row)],['status','Acesso',status]],
  subscriptions: [['name','Família'],['plan_id','Plano'],['subscription_status','Estado',status],['subscription_expires_at','Vigência',date],['trial_ends_at','Fim da experiência',date]],
  payments: [['family_name','Família'],['gateway','Provedor'],['event_type','Evento'],['processed','Confirmação',v => v ? 'Processado' : 'Pendente'],['created_at','Data',date]],
  audit: [['created_at','Data',date],['action','Operação'],['actor_id','Administrador'],['target_id','Registro'],['reason','Motivo']],
  content: [['title','Título'],['published','Publicação',v => v ? 'Publicado' : 'Rascunho'],['updated_at','Atualização',date]],
};
function Field({ name, label, value, onChange, multiline, ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return <div className="form-group"><label className="form-label" htmlFor={name}>{label}</label><Tag className="form-input" id={name} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props} /></div>;
}
function DataTable({ rows, fields, onEdit }) {
  return <div className="web-table-scroll"><table className="web-data-table"><thead><tr>{fields.map(([key,label]) => <th scope="col" key={key}>{label}</th>)}{onEdit && <th scope="col">Ações</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id || row.code}>{fields.map(([key,,render]) => <td key={key}>{render ? render(row[key], row) : String(row[key] ?? '—')}</td>)}{onEdit && <td>{row.role === 'master' ? <span className="web-muted">Conta protegida</span> : <button className="btn btn-sm btn-ghost" onClick={() => onEdit(row)}>Gerenciar</button>}</td>}</tr>)}</tbody></table>{rows.length === 0 && <div className="web-empty">Nenhum registro encontrado.</div>}</div>;
}
function ChangeForm({ action, row, onSave, busy, onCancel }) {
  const [draft,setDraft] = useState(row);
  const [reason,setReason] = useState('');
  const update = (key,value) => setDraft(d => ({...d,[key]:value}));
  return <div className="web-editor"><h2>{action === 'save_content' ? 'Conteúdo da plataforma' : action === 'save_plan' ? 'Apresentação do plano' : `Acesso de ${row.name}`}</h2>
    <form onSubmit={e => { e.preventDefault(); onSave(action,{ ...draft, reason }); }}>
      {['save_family','save_user'].includes(action) && <><p>A suspensão impede o acesso aos dados. Ela preserva os registros e pode ser revertida. Uma suspensão não cancela a cobrança na Google Play.</p><label className="form-label" htmlFor="edit-status">Acesso à plataforma</label><select id="edit-status" className="form-select" value={draft.status === 'inactive' ? 'inactive' : 'active'} onChange={e => update('status',e.target.value)}><option value="active">Ativo</option><option value="inactive">Suspenso</option></select></>}
      {action === 'save_plan' && <><Field name="plan-label" label="Nome" value={draft.label} onChange={v=>update('label',v)} maxLength={80} required /><Field name="plan-description" label="Descrição" value={draft.description} onChange={v=>update('description',v)} maxLength={300} /><Field name="plan-features" label="Benefícios (um por linha)" multiline value={draft.features.join('\n')} onChange={v=>update('features',v.split('\n').slice(0,12))} maxLength={1800} /><label><input type="checkbox" checked={draft.enabled} onChange={e=>update('enabled',e.target.checked)} /> Exibir na landing</label><p className="web-muted">Preços, ofertas e disponibilidade para compra são configurados na Play Console. Esta alteração controla a apresentação na web.</p></>}
      {action === 'save_content' && <><Field name="content-title" label="Título" value={draft.title} onChange={v=>update('title',v)} maxLength={120} required /><Field name="content-body" label="Conteúdo" multiline value={draft.body} onChange={v=>update('body',v)} maxLength={2000} required /><label><input type="checkbox" checked={!!draft.published} onChange={e=>update('published',e.target.checked)} /> Publicar na landing</label><p className="web-muted">Textos publicados são públicos. Use apenas conteúdo destinado aos visitantes.</p></>}
      <Field name="change-reason" label="Motivo para a auditoria" value={reason} onChange={setReason} required minLength={8} maxLength={300} />
      <div className="web-action-row"><button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar alteração'}</button><button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button></div>
    </form>
  </div>;
}
function SettingsForm({ initial, onSave, busy }) {
  const [draft,setDraft] = useState(initial || {});
  const [reason,setReason] = useState('');
  return <form className="web-editor" onSubmit={e => {e.preventDefault();onSave('save_settings',{...draft,reason});}}>
    {Object.entries({announcement:'Comunicado da plataforma',support_email:'E-mail de suporte',privacy_url:'Política de privacidade (HTTPS)',terms_url:'Termos de uso (HTTPS)'}).map(([key,label]) => <Field key={key} name={key} label={label} value={draft[key]} onChange={v=>setDraft(d=>({...d,[key]:v}))} type={key==='support_email'?'email':key.endsWith('_url')?'url':'text'} maxLength={key==='announcement'?300:key==='support_email'?254:2048} />)}
    <Field name="play-install-url" label="Link oficial Google Play (público ou participação em testes)" value={draft.play_install_url} onChange={v=>setDraft(d=>({...d,play_install_url:v}))} type="url" maxLength={2048} />
    <label><input type="checkbox" checked={draft.play_available===true} onChange={e=>setDraft(d=>({...d,play_available:e.target.checked}))} /> Aplicativo disponível para instalação</label>
    <p className="web-muted">O rollout de cobrança Play permanece sob configuração operacional no backend. Ative-o após validar compras e restauração na faixa de testes.</p>
    <Field name="settings-reason" label="Motivo para a auditoria" value={reason} onChange={setReason} required minLength={8} maxLength={300} /><button className="btn btn-primary" disabled={busy}>Salvar configurações</button>
  </form>;
}
function MasterSection({ section }) {
  const client = useQueryClient();
  const [search,setSearch] = useState('');
  const [appliedSearch,setAppliedSearch] = useState('');
  const [page,setPage] = useState(0);
  const [editor,setEditor] = useState(null);
  const [familyId,setFamilyId] = useState('');
  const [reason,setReason] = useState('');
  const [notice,setNotice] = useState({title:'',message:''});
  const [feedback,setFeedback] = useState('');
  const {data,isPending,isFetching,error,refetch} = useQuery({
    queryKey:['web-master',section,page,appliedSearch,familyId],
    queryFn:() => webAdmin(section,{limit:25,offset:page*25,search:appliedSearch,family_id:familyId}),
    enabled: section !== 'notifications' && (section !== 'modules' || !!familyId),
    placeholderData: undefined, retry:false, staleTime:30000,
  });
  const families = useQuery({queryKey:['web-master','family-selector',appliedSearch],queryFn:()=>webAdmin('families',{limit:100,search:appliedSearch}),enabled:['modules','notifications'].includes(section),placeholderData:undefined,retry:false});
  const mutation = useMutation({mutationFn:({action,payload})=>webAdmin(action,payload),onSuccess:()=>{setFeedback('Operação confirmada e registrada na auditoria.');setEditor(null);setReason('');client.invalidateQueries({queryKey:['web-master']});},onError:e=>setFeedback(e.message)});
  const save = (action,payload) => {setFeedback('');mutation.mutate({action,payload});};
  const rows = data?.rows || [];
  const list = Object.hasOwn(columns,section);
  const title = MASTER_SECTIONS.find(([key])=>key===section)?.[1] || 'Visão geral';
  return <div className="web-admin-page">
    <div className="web-page-heading"><div><p className="web-kicker">CONTROLE DA PLATAFORMA</p><h1>{title}</h1><p>Dados operacionais com acesso restrito e alterações auditadas.</p></div><button className="btn btn-ghost" onClick={()=>{setFeedback('');if(section==='notifications')families.refetch();else refetch();}} disabled={isFetching}>{isFetching ? 'Atualizando…' : 'Atualizar dados'}</button></div>
    {(section==='families'||section==='users'||section==='subscriptions'||section==='modules'||section==='notifications') && <form className="web-toolbar" onSubmit={e=>{e.preventDefault();setPage(0);setAppliedSearch(search);}}><label htmlFor="master-search" className="sr-only">Buscar {section==='users'?'usuário':'família'} pelo nome</label><input id="master-search" className="form-input" placeholder={`Buscar ${section==='users'?'usuário':'família'} pelo nome…`} maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} /><button className="btn btn-primary">Buscar</button></form>}
    {feedback && <p role="status" className="web-inline-message">{feedback}</p>}
    {error && <div className="web-inline-message" role="alert"><strong>Não foi possível carregar os dados.</strong><p>{error.message}</p><button className="btn btn-ghost" onClick={()=>refetch()}>Tentar novamente</button></div>}
    {isPending && section!=='notifications' && (section!=='modules'||familyId) && <p role="status">Carregando dados do servidor…</p>}
    {section==='overview' && data && <><div className="web-stats-grid">{[['families','Famílias'],['active_families','Com acesso habilitado'],['users','Usuários'],['subscriptions','Assinaturas ativas'],['trial','Em experiência'],['tasks','Tarefas cadastradas'],['completed','Ocorrências aprovadas'],['errors_24h','Erros web em 24h']].map(([key,label])=><article key={key} className="web-stat"><span>{label}</span><strong>{Number(data[key]).toLocaleString('pt-BR')}</strong></article>)}</div><div className="web-admin-note"><h2>A operação em um só lugar.</h2><p>Gerencie acessos, acompanhe assinaturas e consulte a auditoria pelo menu. As cobranças são realizadas pela Google Play. Dados clínicos, localização familiar e tokens de compra permanecem fora dos relatórios administrativos.</p></div></>}
    {list && data && <><DataTable rows={rows} fields={columns[section]} onEdit={['families','users','content'].includes(section) ? row=>setEditor({action:section==='families'?'save_family':section==='users'?'save_user':'save_content',row}) : null} /><div className="web-pagination"><span>{data.total ?? rows.length} registros · página {page+1}</span><button className="btn btn-sm btn-ghost" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><button className="btn btn-sm btn-ghost" disabled={(page+1)*25>=(data.total||0)||page>=400} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></>}
    {section==='subscriptions' && <p className="web-admin-note">A vigência vem da verificação Google Play no servidor. Use a Play Console para preços, ofertas, reembolsos e alterações de cobrança.</p>}
    {section==='payments' && <p className="web-admin-note">Cada linha mostra a última compra Google Play verificada para uma família. Relatórios financeiros, valores liquidados e reembolsos ficam na Play Console. Tokens e payloads privados não são exibidos.</p>}
    {section==='plans' && data && <div className="web-plan-cards">{rows.map(plan=><article className="web-admin-note" key={plan.code}><h2>{plan.label}</h2><p>{plan.description}</p><PromotionalPrice plan={plan} className="web-plan-price" /><p>{plan.enabled?'Exibido na landing':'Oculto na landing'}</p><strong>Compra pelo aplicativo Android · Google Play</strong><ul>{plan.features.map(f=><li key={f}>{f}</li>)}</ul><button className="btn btn-ghost" onClick={()=>setEditor({action:'save_plan',row:plan})}>Editar apresentação</button></article>)}</div>}
    {section==='content' && <button className="btn btn-primary" onClick={()=>setEditor({action:'save_content',row:{title:'',body:'',published:false}})}>Criar conteúdo</button>}
    {['modules','notifications'].includes(section) && <div className="web-editor"><label htmlFor="target-family" className="form-label">Família</label><select id="target-family" className="form-select" value={familyId} onChange={e=>setFamilyId(e.target.value)}><option value="">Selecione uma família</option>{(families.data?.rows||[]).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><p className="web-muted">Até 100 resultados. Use a busca para localizar uma família.</p>{families.error && <p role="alert">{families.error.message}</p>}
      {section==='modules' && familyId && data && <div className="web-module-controls">{[...WEB_MODULES,...[['routines','Rotinas'],['medals','Medalhas'],['piggy_bank','Cofrinho'],['goals','Metas'],['reports','Relatórios'],['notifications','Notificações']].map(([key,label])=>({key,label}))].map(m=>{const current=rows.find(r=>r.module_key===m.key)?.is_enabled===true;return <div key={m.key}><span>{m.label}</span><button className={`btn btn-sm ${current?'btn-primary':'btn-ghost'}`} disabled={mutation.isPending||reason.trim().length<8} onClick={()=>save('save_modules',{id:familyId,modules:{[m.key]:!current},reason})}>{current?'Habilitado':'Desabilitado'}</button></div>;})}</div>}
      {section==='notifications' && <><p>Envie um aviso à caixa de entrada do gestor desta família. A entrega push depende dos dispositivos e preferências configurados.</p><Field name="notice-title" label="Título" value={notice.title} onChange={v=>setNotice(n=>({...n,title:v}))} maxLength={120} /><Field name="notice-message" label="Mensagem" multiline value={notice.message} onChange={v=>setNotice(n=>({...n,message:v}))} maxLength={1000} /></>}
      <Field name="family-action-reason" label="Motivo para a auditoria" value={reason} onChange={setReason} minLength={8} maxLength={300} />{section==='notifications' && <button className="btn btn-primary" disabled={!familyId||!notice.title||!notice.message||reason.trim().length<8||mutation.isPending} onClick={()=>save('notify',{id:familyId,...notice,reason})}>Enviar aviso ao gestor</button>}
    </div>}
    {section==='settings' && data && <SettingsForm key={data.updated_at} initial={data} onSave={save} busy={mutation.isPending} />}
    {section==='operations' && data && <><div className="web-stats-grid"><article className="web-stat"><span>Tamanho do banco</span><strong>{(data.database_bytes/1048576).toFixed(1)} MB</strong></article><article className="web-stat"><span>Tabelas públicas com RLS</span><strong>{data.rls_tables}</strong></article><article className="web-stat"><span>Tabelas públicas sem RLS</span><strong>{data.unprotected_tables}</strong></article><article className="web-stat"><span>Último heartbeat</span><strong style={{fontSize:17}}>{date(data.heartbeat)}</strong></article></div><div className="web-admin-note"><h2>Métricas web · últimas 24 horas</h2><p>Eventos classificados, limitados por usuário e retidos por até 30 dias. Tempos medem o carregamento do cliente; não representam a latência completa do servidor.</p><DataTable rows={(data.events||[]).map((r,i)=>({...r,id:i}))} fields={[["kind","Evento"],["route","Ambiente"],["total","Quantidade"],["duration_ms","Média (ms)"]]} /></div><h2>Registros recentes</h2><DataTable rows={data.logs||[]} fields={[["created_at","Data",date],["kind","Código"],["route","Ambiente"],["duration_ms","Tempo (ms)"]]} /><p className="web-admin-note">Use Supabase Dashboard e Play Console para logs de infraestrutura, jobs, alertas e diagnósticos de pagamento. A web evita reproduzir payloads sensíveis ou oferecer comandos SQL arbitrários.</p></>}
    {editor && <ChangeForm key={editor.row.id||editor.row.code||'new'} {...editor} onSave={save} busy={mutation.isPending} onCancel={()=>setEditor(null)} />}
  </div>;
}
export default function WebMasterPage() {
  const { section='overview' } = useParams();
  if (!MASTER_SECTIONS.some(([key])=>key===section)) return <p role="alert">Página administrativa não encontrada.</p>;
  return <MasterSection key={section} section={section} />;
}
