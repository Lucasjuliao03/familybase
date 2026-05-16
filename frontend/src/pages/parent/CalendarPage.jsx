import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import { calendarEventAccentColor } from '../../lib/userDisplayColors';
import getHolidays from '../../lib/brazilianHolidays';
import { deriveCalendarRange, normalizeAnchorMidday } from '../../lib/familyCalendarRange';
import FamilyCalendarBoard from '../../components/calendar/FamilyCalendarBoard';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function CalendarPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const defaultEventColor = useMemo(() => user?.display_color || '#6C5CE7', [user?.display_color]);

  const [events, setEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [tab, setTab] = useState('calendar');

  /** Visão inicial: mensal (“visão geral” de eventos permitidos pelo backend). */
  const [viewMode, setViewMode] = useState('month');
  const [anchorDate, setAnchorDate] = useState(() => normalizeAnchorMidday(new Date()));
  /** Padrão: todos (sem filtro server-side por dependente). */
  const [filterChildId, setFilterChildId] = useState('all');

  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    id: null,
    title: '',
    description: '',
    date: '',
    type: 'family',
    child_id: '',
    visible_to_child: true,
    color: '#6C5CE7',
  });
  const [searchTerm, setSearchTerm] = useState('');

  const calendarParams = useMemo(() => {
    if (tab !== 'calendar') return null;
    const { from, to } = deriveCalendarRange(viewMode, anchorDate);
    const p = { from, to };
    if (filterChildId && filterChildId !== 'all') p.filter_child_id = filterChildId;
    return p;
  }, [tab, viewMode, anchorDate, filterChildId]);

  const historyParams = useMemo(() => {
    if (tab !== 'history') return null;
    const y = anchorDate.getFullYear();
    const p = { from: `${y}-01-01`, to: `${y}-12-31` };
    if (filterChildId && filterChildId !== 'all') p.filter_child_id = filterChildId;
    return p;
  }, [tab, anchorDate, filterChildId]);

  useEffect(() => {
    api.get('/families/children').then((r) => setChildren(r.data)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const p = tab === 'calendar' ? calendarParams : historyParams;
    if (!p?.from || !p?.to) return;
    let cancelled = false;
    setCalendarLoading(tab === 'calendar');
    api
      .get('/calendar', { params: p })
      .then((r) => {
        if (!cancelled) setEvents(r.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && tab === 'calendar') setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, calendarParams, historyParams]);

  const refreshCurrentRange = useCallback(async () => {
    const p = tab === 'calendar' ? calendarParams : historyParams;
    if (!p?.from || !p?.to) return;
    try {
      const { data } = await api.get('/calendar', { params: p });
      setEvents(data || []);
    } catch (_) {}
  }, [tab, calendarParams, historyParams]);

  useAutoRefresh(refreshCurrentRange, 2600, { includeRouteChanges: false });

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
      await refreshCurrentRange();
    } catch (err) {
      toast.error(err.message || t('error_occurred'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir evento?')) return;
    try {
      await api.delete(`/calendar/${id}`);
      toast.success('Evento excluído');
      await refreshCurrentRange();
    } catch (_) {
      toast.error(t('error_occurred'));
    }
  };

  const handleChildSelect = (childId) => {
    const child = children.find((c) => c.id === childId);
    setForm((p) => ({
      ...p,
      child_id: childId,
      color: child ? child.color : p.color,
    }));
  };

  const colors = [
    '#6C5CE7',
    '#E84393',
    '#00B894',
    '#FDCB6E',
    '#74B9FF',
    '#E17055',
    '#A29BFE',
    '#55EFC4',
  ];

  const holidayYear = anchorDate.getFullYear();
  const holidays = useMemo(() => getHolidays(holidayYear), [holidayYear]);

  const onCreateOnDay = (dateStr, closeDetailModal) => {
    setForm({
      id: null,
      title: '',
      description: '',
      date: dateStr,
      type: 'family',
      child_id: '',
      visible_to_child: true,
      color: defaultEventColor,
    });
    if (typeof closeDetailModal === 'function') closeDetailModal();
    setShowModal(true);
  };

  const onEditEvent = (ev) => {
    setForm(ev);
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div>
          <h1 className="page-title">📅 {t('calendar')}</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Vistas <strong>Mês</strong>, <strong>Semana</strong> e <strong>Dia</strong>; filtro <strong>Todos / dependente</strong> ao lado de «Hoje».
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm({
              id: null,
              title: '',
              description: '',
              date: '',
              type: 'family',
              child_id: '',
              visible_to_child: true,
              color: defaultEventColor,
            });
            setShowModal(true);
          }}
        >
          + {t('add_event')}
        </button>
      </div>

      <div className="tabs tabs-scroll mb-24">
        <button type="button" className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
          📅 Calendário (visão geral)
        </button>
        <button type="button" className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          🔍 Histórico / Pesquisa
        </button>
      </div>

      {tab === 'calendar' && (
        <>
          <div className="card">
            <FamilyCalendarBoard
              mode="parent"
              events={events}
              loading={calendarLoading}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              anchorDate={anchorDate}
              onAnchorChange={setAnchorDate}
              filterChildId={filterChildId}
              onFilterChildIdChange={setFilterChildId}
              childrenOptions={children}
              showUserFilter
              holidaysMap={holidays}
              t={t}
              onEditEvent={onEditEvent}
              onCreateOnDay={(ds, cb) => onCreateOnDay(ds, cb)}
            />
          </div>

          <div className="flex gap-16 mt-16" style={{ flexWrap: 'wrap', paddingLeft: 4 }}>
            {children.map((c) => (
              <div key={c.id} className="flex gap-8" style={{ alignItems: 'center', fontSize: '0.82rem' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} /> {c.name}
              </div>
            ))}
            <div className="flex gap-8" style={{ alignItems: 'center', fontSize: '0.82rem' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--primary)' }} />
              {t('family_event')}
            </div>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="mb-16">
            <input
              type="text"
              className="form-input"
              placeholder="Pesquisar eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="table-container">
            <table className="table-stack-md">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Título</th>
                  <th>Filho</th>
                  <th>Vinculado</th>
                  <th>Tipo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter((e) => {
                    const q = searchTerm.toLowerCase().trim();
                    if (!q) return true;
                    const titulo = e.title || '';
                    if (titulo.toLowerCase().includes(q)) return true;
                    const filho = e.child_name || '';
                    if (filho.toLowerCase().includes(q)) return true;
                    const link = e.linked_user_label || '';
                    if (link.toLowerCase().includes(q)) return true;
                    if (e.description && e.description.toLowerCase().includes(q)) return true;
                    if (e.date) {
                      if (e.date.includes(q)) return true;
                      const p = e.date.split('-');
                      if (p.length === 3 && `${p[2]}/${p[1]}/${p[0]}`.includes(q)) return true;
                    }
                    return false;
                  })
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((ev) => {
                    const p = (ev.date || '').split('-');
                    const data = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ev.date || '';
                    return (
                      <tr key={ev.id}>
                        <td data-label="Data">
                          {data}
                          {ev.time && ` às ${ev.time}`}
                        </td>
                        <td data-label="Título">
                          <div className="flex gap-8" style={{ alignItems: 'center' }}>
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                background: calendarEventAccentColor(ev),
                                flexShrink: 0,
                              }}
                            />
                            {ev.title}
                          </div>
                        </td>
                        <td data-label="Filho">{ev.child_name || '-'}</td>
                        <td data-label="Vinculado">{ev.linked_user_label || '—'}</td>
                        <td data-label="Tipo">
                          <span className="badge badge-info">{t(ev.type)}</span>
                        </td>
                        <td data-label="Ações">
                          <button type="button" className="btn-icon btn-ghost" onClick={() => onEditEvent(ev)}>
                            ✏️
                          </button>
                          <button type="button" className="btn-icon btn-ghost" onClick={() => handleDelete(ev.id)}>
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowModal(false)}>
          <div className="modal" role="dialog" onMouseDown={(e) => e.stopPropagation()} aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">{form.id ? 'Editar Evento' : t('add_event')}</h2>
              <button type="button" className="modal-close" aria-label={t('cancel')} onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">{t('event_title')} *</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-3">
                <div className="form-group">
                  <label className="form-label">{t('event_date')} *</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Horário</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.time || ''}
                    onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('event_type')}</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="family">{t('family_event')}</option>
                    <option value="school">{t('school_event')}</option>
                    <option value="activity">{t('activity')}</option>
                    <option value="other">{t('child_event')}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('select_child')}</label>
                <select className="form-select" value={form.child_id || ''} onChange={(e) => handleChildSelect(e.target.value)}>
                  <option value="">{t('family_event')}</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cor do Evento</label>
                <div className="flex gap-8">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, color: c }))}
                      aria-label={`Cor ${c}`}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: c,
                        border: form.color === c ? '3px solid var(--text)' : '3px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('task_description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.visible_to_child}
                    onChange={(e) => setForm((p) => ({ ...p, visible_to_child: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span className="form-label" style={{ margin: 0 }}>
                    👀 Visível para os filhos
                  </span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
