import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { calendarEventAccentColor, normalizeHex } from '../../lib/userDisplayColors';
import getHolidays from '../../lib/brazilianHolidays';
import FamilyCalendarBoard from '../../components/calendar/FamilyCalendarBoard';
import { deriveCalendarRange, normalizeAnchorMidday, formatLocalYMD } from '../../lib/familyCalendarRange';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function MyCalendar() {
  const { childProfile } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    id: null,
    title: '',
    description: '',
    date: '',
    time: '',
    type: 'activity',
  });

  const [viewMode, setViewMode] = useState('month');
  const [anchorDate, setAnchorDate] = useState(() => normalizeAnchorMidday(new Date()));
  const [calendarLoading, setCalendarLoading] = useState(false);

  const calendarParams = useMemo(() => {
    const { from, to } = deriveCalendarRange(viewMode, anchorDate);
    return { from, to };
  }, [viewMode, anchorDate]);

  const holidayYear = anchorDate.getFullYear();
  const holidays = useMemo(() => getHolidays(holidayYear), [holidayYear]);

  /** Cor escolhida no cadastro — eventos próprios usam sempre esta cor (fallback no servidor também). */
  const childCalendarColor = useMemo(() => {
    const h = normalizeHex(childProfile?.color);
    return h && /^#[0-9A-F]{6}$/.test(h) ? h : undefined;
  }, [childProfile?.color]);

  const withChildCalendarAccent = useCallback(
    (payload) => (childCalendarColor ? { ...payload, color: childCalendarColor } : payload),
    [childCalendarColor],
  );

  const reloadCalendarRange = useCallback(async () => {
    try {
      const { data } = await api.get('/calendar', { params: calendarParams });
      setEvents(data || []);
    } catch (_) {
      /* rede / RLS transitório — mantemos lista anterior até novo sucesso */
    }
  }, [calendarParams]);

  useEffect(() => {
    let cancelled = false;
    setCalendarLoading(true);
    api
      .get('/calendar', { params: calendarParams })
      .then((r) => {
        if (!cancelled) setEvents(r.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [calendarParams, location.pathname]);

  useAutoRefresh(reloadCalendarRange, 2600);

  const todayStr = formatLocalYMD(new Date());

  const upcomingEvents = useMemo(
    () => events.filter((e) => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)),
    [events, todayStr],
  );

  const fetchEventsNow = reloadCalendarRange;

  /** Fechar só quando mousedown + click foram no próprio backdrop (evita fechar ao usar calendário nativo da data/time). */
  const modalBackdropClkRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const body = withChildCalendarAccent(form);
      if (form.id) await api.put(`/calendar/${form.id}`, body);
      else await api.post('/calendar', body);
      toast.success(form.id ? 'Evento atualizado' : 'Evento criado! 📅');
      setShowModal(false);
      setForm({ id: null, title: '', description: '', date: '', time: '', type: 'activity' });
      await fetchEventsNow();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  const openEditEvent = (ev) => {
    setForm({
      id: ev.id,
      title: ev.title || '',
      description: ev.description || '',
      date: ev.date || '',
      time: ev.time || '',
      type: ev.type || 'activity',
    });
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div>
          <h1 className="page-title">📅 {t('my_calendar')}</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Alterne entre <strong>Mês</strong>, <strong>Semana</strong> e <strong>Dia</strong>; toque num dia para ver os eventos.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm({ id: null, title: '', description: '', date: '', time: '', type: 'activity' });
            setShowModal(true);
          }}
        >
          + Novo Evento
        </button>
      </div>

      <div className="card mb-24">
        <FamilyCalendarBoard
          mode="child"
          events={events}
          loading={calendarLoading}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          anchorDate={anchorDate}
          onAnchorChange={setAnchorDate}
          showUserFilter={false}
          holidaysMap={holidays}
          t={t}
          onEditEvent={openEditEvent}
          onCreateOnDay={(dateStr, closeDetail) => {
            setForm({ id: null, title: '', description: '', date: dateStr, time: '', type: 'activity' });
            if (typeof closeDetail === 'function') closeDetail();
            setShowModal(true);
          }}
        />
      </div>

      <div className="card">
        <h3 className="card-title mb-16">📋 Próximos Eventos</h3>
        {upcomingEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>Nenhum evento próximo</h3>
          </div>
        ) : (
          upcomingEvents.slice(0, 12).map((ev) => (
            <button
              type="button"
              key={ev.id}
              className="calendar-day-agenda-row"
              style={{
                marginBottom: 10,
                border: `1px solid var(--border)`,
                justifyContent: 'flex-start',
                gap: 12,
              }}
              onClick={() => openEditEvent(ev)}
            >
              <div style={{ width: 5, height: 44, borderRadius: 10, background: calendarEventAccentColor(ev), flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{ev.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                  <strong>
                    {(() => {
                      const [ay, am, ad] = ev.date.split('-');
                      return `${ad}/${am}/${ay}`;
                    })()}
                  </strong>
                  {ev.time && ` às ${ev.time}`}
                  {ev.description && ` • ${ev.description}`}
                </div>
                {ev.linked_user_label ? (
                  <div style={{ fontSize: '0.78rem', marginTop: 4, color: 'var(--text-light)' }}>
                    👤 {ev.linked_user_label}
                  </div>
                ) : null}
              </div>
              <span className="badge badge-info">{t(ev.type)}</span>
            </button>
          ))
        )}
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          role="presentation"
          style={{ zIndex: 1100 }}
          onMouseDown={(e) => {
            modalBackdropClkRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && modalBackdropClkRef.current) setShowModal(false);
            modalBackdropClkRef.current = false;
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">{form.id ? '✏️ Editar Evento' : '📅 Novo Evento'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">O que é? *</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Treino de Futebol"
                  required
                />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.time || ''}
                    onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  <option value="activity">🏀 Atividade</option>
                  <option value="school">📚 Escola</option>
                  <option value="family">🏠 Família</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">{form.id ? 'Salvar' : 'Criar Evento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
