import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { calendarEventAccentColor } from '../../lib/userDisplayColors';

function getHolidays(year) {
  const calcEaster = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
  };
  const fmt = (m, d) => `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const easter = calcEaster(year);
  const shift = (n) => {
    const d = new Date(year, easter.month - 1, easter.day + n);
    return fmt(d.getMonth() + 1, d.getDate());
  };
  const h = {};
  h[fmt(easter.month, easter.day)] = 'Páscoa';
  h[shift(-48)] = 'Carnaval';
  h[shift(-47)] = 'Carnaval';
  h[shift(-46)] = 'Quarta-Feira de Cinzas';
  h[shift(-2)] = 'Paixão de Cristo';
  h[shift(60)] = 'Corpus Christi';
  const fixed = [
    ['01-01','Confraternização Universal'],
    ['04-21','Tiradentes'],
    ['05-01','Dia Mundial do Trabalho'],
    ['09-07','Independência do Brasil'],
    ['10-12','Nossa Senhora Aparecida'],
    ['10-28','Dia do Servidor Público'],
    ['11-02','Finados'],
    ['11-15','Proclamação da República'],
    ['11-20','Dia da Consciência Negra'],
    ['12-25','Natal'],
  ];
  fixed.forEach(([md, name]) => { h[`${year}-${md}`] = name; });
  return h;
}

export default function CalendarPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const defaultEventColor = useMemo(() => user?.display_color || '#6C5CE7', [user?.display_color]);
  const [events, setEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ id: null, title: '', description: '', date: '', type: 'family', child_id: '', visible_to_child: true, color: '#6C5CE7' });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const params = tab === 'history' ? {} : { year, month: month + 1 };
    api.get('/calendar', { params }).then(r => setEvents(r.data)).catch(() => {});
    api.get('/families/children').then(r => setChildren(r.data)).catch(() => {});
  }, [year, month, tab]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        await api.put(`/calendar/${form.id}`, form);
        toast.success('Evento atualizado');
      } else {
        await api.post('/calendar', form);
        toast.success(t('event_created'));
      }
      setShowModal(false);
      const params = tab === 'history' ? {} : { year, month: month + 1 };
      api.get('/calendar', { params }).then(r => setEvents(r.data));
    } catch (err) { toast.error(err.message || t('error_occurred')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir evento?')) return;
    try {
      await api.delete(`/calendar/${id}`);
      toast.success('Evento excluído');
      const params = tab === 'history' ? {} : { year, month: month + 1 };
      api.get('/calendar', { params }).then(r => setEvents(r.data));
    } catch { toast.error(t('error_occurred')); }
  };

  const handleChildSelect = (childId) => {
    const child = children.find(c => c.id === childId);
    setForm(p => ({ ...p, child_id: childId, color: child ? child.color : p.color }));
  };

  const openDayModal = (cell) => {
    setSelectedDay(cell);
    setShowDayModal(true);
  };

  const colors = ['#6C5CE7','#E84393','#00B894','#FDCB6E','#74B9FF','#E17055','#A29BFE','#55EFC4'];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split('T')[0];
  const days = [t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')];
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const holidays = getHolidays(year);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: '', events: [], other: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, date: dateStr, events: events.filter(e => e.date === dateStr), isToday: dateStr === today, holiday: holidays[dateStr] || null });
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div><h1 className="page-title">📅 {t('calendar')}</h1></div>
        <button className="btn btn-primary" onClick={() => { setForm({ id: null, title: '', description: '', date: '', type: 'family', child_id: '', visible_to_child: true, color: defaultEventColor }); setShowModal(true); }}>+ {t('add_event')}</button>
      </div>

      <div className="tabs tabs-scroll mb-24">
        <button type="button" className={`tab ${tab==='calendar'?'active':''}`} onClick={() => setTab('calendar')}>📅 Visão Mensal</button>
        <button type="button" className={`tab ${tab==='history'?'active':''}`} onClick={() => setTab('history')}>🔍 Histórico / Pesquisa</button>
      </div>

      {tab === 'calendar' && (
      <div className="card">
        <div className="flex-between mb-16">
          <button type="button" className="btn btn-ghost" onClick={prevMonth}>◀</button>
          <h2 style={{fontWeight:700}}>{monthNames[month]} {year}</h2>
          <button type="button" className="btn btn-ghost" onClick={nextMonth}>▶</button>
        </div>

        <div className="calendar-grid-wrapper">
        <div className="calendar-grid">
          {days.map(d => <div key={d} className="calendar-header-cell">{d}</div>)}
          {cells.map((cell, i) => (
            <div key={i} className={`calendar-cell ${cell.isToday ? 'today' : ''} ${cell.other ? 'other-month' : ''}`} style={cell.holiday ? {background:'var(--danger)06'} : {}} onClick={() => !cell.other && cell.day && openDayModal(cell)}>
              {cell.day && <div className="calendar-day" style={cell.holiday ? {color:'var(--danger)'} : {}}>{cell.day}</div>}
              {cell.holiday && <div className="calendar-holiday" title={cell.holiday} style={{fontSize:'0.65rem',color:'var(--danger)',fontWeight:600,textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap',padding:'0 4px',marginTop:-2}}>{cell.holiday}</div>}
              {cell.events?.slice(0, 3).map(ev => (
                <div key={ev.id} className="calendar-event" style={{background: calendarEventAccentColor(ev), cursor: 'pointer', display: 'flex', justifyContent: 'space-between'}} onClick={(e) => { e.stopPropagation(); setForm(ev); setShowModal(true); }}>
                  <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{ev.title}</span>
                  {ev.time && <span style={{fontSize: '0.65rem', opacity: 0.8, marginLeft: 4}}>{ev.time}</span>}
                </div>
              ))}
              {cell.events?.length > 3 && <div style={{fontSize:'0.65rem',color:'var(--text-light)'}}>+{cell.events.length - 3}</div>}
            </div>
          ))}
        </div>
        </div>

        {/* Legend */}
        <div className="flex gap-16 mt-16" style={{flexWrap:'wrap'}}>
          {children.map(c => (
            <div key={c.id} className="flex gap-8" style={{alignItems:'center',fontSize:'0.82rem'}}>
              <div style={{width:12,height:12,borderRadius:3,background:c.color}}></div>{c.name}
            </div>
          ))}
          <div className="flex gap-8" style={{alignItems:'center',fontSize:'0.82rem'}}>
            <div style={{width:12,height:12,borderRadius:3,background:'var(--primary)'}}></div>{t('family_event')}
          </div>
        </div>
      </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="mb-16"><input type="text" className="form-input" placeholder="Pesquisar eventos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="table-container">
            <table className="table-stack-md"><thead><tr><th>Data</th><th>Título</th><th>Filho</th><th>Tipo</th><th>Ações</th></tr></thead>
            <tbody>
              {events.filter(e => {
                const q = searchTerm.toLowerCase().trim();
                if (!q) return true;
                const titulo = e.title || '';
                if (titulo.toLowerCase().includes(q)) return true;
                const filho = e.child_name || '';
                if (filho.toLowerCase().includes(q)) return true;
                if (e.date) {
                  if (e.date.includes(q)) return true;
                  const p = e.date.split('-');
                  if (p.length === 3 && `${p[2]}/${p[1]}/${p[0]}`.includes(q)) return true;
                }
                return false;
              }).sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(ev => {
                const p = (ev.date || '').split('-');
                const data = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ev.date || '';
                return (
                <tr key={ev.id}>
                  <td data-label="Data">{data}{ev.time && ` às ${ev.time}`}</td>
                  <td data-label="Título"><div className="flex gap-8" style={{alignItems:'center'}}><div style={{width:12,height:12,borderRadius:3,background:calendarEventAccentColor(ev),flexShrink:0}}></div>{ev.title}</div></td>
                  <td data-label="Filho">{ev.child_name || '-'}</td>
                  <td data-label="Tipo"><span className="badge badge-info">{t(ev.type)}</span></td>
                  <td data-label="Ações">
                    <button className="btn-icon btn-ghost" onClick={() => { setForm(ev); setShowModal(true); }}>✏️</button>
                    <button className="btn-icon btn-ghost" onClick={() => handleDelete(ev.id)}>🗑️</button>
                  </td>
                </tr>
              )})}
            </tbody></table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{form.id ? 'Editar Evento' : t('add_event')}</h2><button className="modal-close" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleSave}>
              <div className="form-group"><label className="form-label">{t('event_title')} *</label><input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required /></div>
              <div className="grid grid-3">
                <div className="form-group"><label className="form-label">{t('event_date')} *</label><input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">Horário</label><input className="form-input" type="time" value={form.time || ''} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{t('event_type')}</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="family">{t('family_event')}</option>
                    <option value="school">{t('school_event')}</option>
                    <option value="activity">{t('activity')}</option>
                    <option value="other">{t('child_event')}</option>
                  </select></div>
              </div>
              <div className="form-group"><label className="form-label">{t('select_child')}</label>
                <select className="form-select" value={form.child_id || ''} onChange={e => handleChildSelect(e.target.value)}>
                  <option value="">{t('family_event')}</option>
                  {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Cor do Evento</label><div className="flex gap-8">{colors.map(c => <button key={c} type="button" onClick={() => setForm(p => ({...p,color:c}))} style={{width:32,height:32,borderRadius:8,background:c,border:form.color===c?'3px solid var(--text)':'3px solid transparent',cursor:'pointer'}} />)}</div></div>
              <div className="form-group">
                <label className="form-label">{t('task_description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.visible_to_child} onChange={e => setForm(p => ({ ...p, visible_to_child: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  <span className="form-label" style={{ margin: 0 }}>👀 Visível para os filhos</span>
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 4, paddingLeft: 28 }}>
                  {form.visible_to_child ? 'Os filhos poderão ver este evento no calendário.' : 'Apenas os pais verão este evento.'}
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDayModal && selectedDay && (
        <div className="modal-overlay" onClick={() => setShowDayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                📅 {(() => {
                  const [ay, am, ad] = selectedDay.date.split('-');
                  const diaSemana = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][new Date(ay, am-1, ad).getDay()];
                  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
                  return `${diaSemana}, ${parseInt(ad)} de ${meses[parseInt(am)-1]} de ${ay}`;
                })()}
              </h2>
              {(() => {
                const hName = holidays[selectedDay.date];
                return hName ? <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--danger)',background:'var(--danger)10',padding:'2px 10px',borderRadius:20,marginTop:4,display:'inline-block'}}>🎉 {hName}</span> : null;
              })()}
              <button className="modal-close" onClick={() => setShowDayModal(false)}>✕</button>
            </div>
            <div style={{ padding: '4px 0 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ id: null, title: '', description: '', date: selectedDay.date, type: 'family', child_id: '', visible_to_child: true, color: defaultEventColor }); setShowDayModal(false); setShowModal(true); }}>+ Adicionar evento</button>
            </div>
            {selectedDay.events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-light)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📭</div>
                <p>Nenhum evento neste dia</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                {selectedDay.events
                  .sort((a, b) => {
                    if (!a.time && !b.time) return 0;
                    if (!a.time) return 1;
                    if (!b.time) return -1;
                    return a.time.localeCompare(b.time);
                  })
                  .map(ev => (
                    <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: `4px solid ${calendarEventAccentColor(ev)}`, cursor: 'pointer' }} onClick={() => { setForm(ev); setShowDayModal(false); setShowModal(true); }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <strong style={{ fontSize: '1rem', fontWeight: 700 }}>{ev.title}</strong>
                          {ev.time && <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 10 }}>{ev.time}</span>}
                        </div>
                        {ev.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: '4px 0 0' }}>{ev.description}</p>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{t(ev.type)}</span>
                          {ev.child_name && <span className="badge" style={{ fontSize: '0.72rem', background: `${ev.child_color}20`, color: ev.child_color }}>👤 {ev.child_name}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setShowDayModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
