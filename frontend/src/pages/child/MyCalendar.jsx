import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
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

export default function MyCalendar() {
  const { t } = useLanguage();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '', type: 'activity' });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchEvents = async () => {
    try {
      const { data } = await api.get('/calendar', { params: { year, month: month + 1 } });
      setEvents(data);
    } catch {}
  };

  useEffect(() => { fetchEvents(); }, [year, month]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/calendar', form);
      toast.success('Evento criado! 📅');
      setShowModal(false);
      setForm({ title: '', description: '', date: '', time: '', type: 'activity' });
      fetchEvents();
    } catch (err) { toast.error(err.response?.data?.error || t('error_occurred')); }
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split('T')[0];
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: '', events: [], other: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, date: dateStr, events: events.filter(e => e.date === dateStr), isToday: dateStr === today, holiday: getHolidays(year)[dateStr] || null });
  }

  const upcomingEvents = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const openDayModal = (cell) => {
    setSelectedDay(cell);
    setShowDayModal(true);
  };

  const openEditEvent = (ev) => {
    setForm({ title: ev.title, description: ev.description || '', date: ev.date, time: ev.time || '', type: ev.type });
    setShowDayModal(false);
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <h1 className="page-title">📅 {t('my_calendar')}</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Novo Evento</button>
      </div>

      <div className="card mb-24" style={{padding: 0, overflow:'hidden'}}>
        <div className="flex-between" style={{padding: '16px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)'}}>
          <button className="btn btn-ghost" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>◀</button>
          <h2 style={{ fontWeight: 700, margin: 0 }}>{monthNames[month]} {year}</h2>
          <button className="btn btn-ghost" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>▶</button>
        </div>
        <div className="calendar-grid" style={{border:'none'}}>
          {days.map(d => <div key={d} className="calendar-header-cell" style={{background:'var(--bg)', fontWeight:700}}>{d}</div>)}
          {cells.map((cell, i) => (
            <div key={i} className={`calendar-cell ${cell.isToday ? 'today' : ''} ${cell.other ? 'other-month' : ''}`} style={Object.assign({minHeight: 110}, cell.holiday ? {background:'var(--danger)06'} : {})} onClick={() => !cell.other && cell.day && openDayModal(cell)}>
              {cell.day && <div className="calendar-day" style={{fontWeight: cell.isToday ? 800 : 500, ...(cell.holiday ? {color:'var(--danger)'} : {})}}>{cell.day}</div>}
              {cell.holiday && <div style={{fontSize:'0.62rem',color:'var(--danger)',fontWeight:600,textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap',padding:'0 4px',marginTop:-2}}>{cell.holiday}</div>}
              <div className="calendar-events-container" style={{display:'flex', flexDirection:'column', gap: 4}}>
                {cell.events?.map(ev => (
                  <div key={ev.id} className="calendar-event" style={{
                    background: calendarEventAccentColor(ev),
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    padding: '3px 6px',
                    borderRadius: 4,
                    color: '#fff',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }} onClick={(e) => { e.stopPropagation(); openEditEvent(ev); }}>
                    <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{ev.title}</span>
                    {ev.time && <span style={{fontSize: '0.65rem', opacity: 0.8, marginLeft: 4}}>{ev.time}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title mb-16">📋 Próximos Eventos</h3>
        {upcomingEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>Nenhum evento próximo</h3>
          </div>
        ) : upcomingEvents.slice(0, 8).map(ev => (
          <div key={ev.id} className="flex gap-12" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <div style={{ width: 5, height: 40, borderRadius: 10, background: calendarEventAccentColor(ev), flexShrink: 0 }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{ev.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                                <strong>{(() => { const [ay, am, ad] = ev.date.split('-'); return `${ad}/${am}/${ay}`; })()}</strong>
                {ev.time && ` às ${ev.time}`}
                {ev.description && ` • ${ev.description}`}
              </div>
            </div>
            <span className="badge badge-info" style={{background: `${calendarEventAccentColor(ev)}15`, color: calendarEventAccentColor(ev)}}>
              {ev.type}
            </span>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{form.id ? '✏️ Editar Evento' : '📅 Novo Evento'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">O que é? *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Treino de Futebol" required />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <input className="form-input" type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  <option value="activity">🏀 Atividade</option>
                  <option value="school">📚 Escola</option>
                  <option value="family">🏠 Família</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{form.id ? 'Salvar Alterações' : 'Criar Evento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDayModal && selectedDay && (
        <div className="modal-overlay" onClick={() => setShowDayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
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
                const hName = getHolidays(parseInt(selectedDay.date.split('-')[0]))[selectedDay.date];
                return hName ? <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--danger)',background:'var(--danger)10',padding:'2px 10px',borderRadius:20,marginTop:4,display:'inline-block'}}>🎉 {hName}</span> : null;
              })()}
              <button className="modal-close" onClick={() => setShowDayModal(false)}>✕</button>
            </div>
            <div style={{ padding: '4px 0 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ title: '', description: '', date: selectedDay.date, time: '', type: 'activity' }); setShowDayModal(false); setShowModal(true); }}>+ Adicionar evento</button>
            </div>
            {selectedDay.events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-light)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📭</div>
                <p>Nenhum evento neste dia</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                {selectedDay.events
                  .sort((a, b) => {
                    if (!a.time && !b.time) return 0;
                    if (!a.time) return 1;
                    if (!b.time) return -1;
                    return a.time.localeCompare(b.time);
                  })
                  .map(ev => (
                    <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: `4px solid ${calendarEventAccentColor(ev)}`, cursor: 'pointer' }} onClick={() => openEditEvent(ev)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <strong style={{ fontSize: '1rem', fontWeight: 700 }}>{ev.title}</strong>
                          {ev.time && <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 10 }}>{ev.time}</span>}
                        </div>
                        {ev.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: '4px 0 0' }}>{ev.description}</p>}
                        <span className="badge badge-info" style={{ fontSize: '0.72rem', marginTop: 6 }}>{t(ev.type)}</span>
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
