import { useEffect, useMemo, useState } from 'react';
import {
  deriveCalendarRange,
  navigateAnchor,
  formatLocalYMD,
  todayLocalYMD,
  normalizeAnchorMidday,
  datesBetweenInclusive,
} from '../../lib/familyCalendarRange';
import { calendarEventAccentColor } from '../../lib/userDisplayColors';

const MONTH_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKD_LONG_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKD_SHORT_PT_GRID = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKD_SHORT_MON_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function formatDMY(ds) {
  if (!ds || ds.length < 10) return '';
  const [y, m, d] = ds.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function weekdayLongPt(ds) {
  const [y, m, d] = String(ds).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const wd = WEEKD_LONG_PT[dt.getDay()] || '';
  return `${wd}, ${parseInt(d, 10)} de ${MONTH_PT[(m || 1) - 1]} de ${y}`;
}

function navigateTitle(viewMode, anchorDate, fromStr, toStr) {
  const a = normalizeAnchorMidday(anchorDate);
  const y = a.getFullYear();
  const m = a.getMonth();
  const d = a.getDate();
  if (viewMode === 'month') return `${MONTH_PT[m]} ${y}`;
  if (viewMode === 'week' && fromStr && toStr) return `${formatDMY(fromStr)} – ${formatDMY(toStr)}`;
  return weekdayLongPt(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

function eventsForDay(events, ds) {
  return (events || []).filter((e) => e && e.date === ds);
}

function sortByTime(events) {
  return [...events].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return String(a.time).localeCompare(String(b.time));
  });
}

function visibilityLabel(v) {
  if (!v || v === 'family') return null;
  if (v === 'private') return 'Privado';
  if (v === 'child') return 'Criança';
  return v;
}

export default function FamilyCalendarBoard({
  mode = 'parent',
  events,
  loading = false,
  viewMode,
  onViewModeChange,
  anchorDate,
  onAnchorChange,
  filterChildId = 'all',
  onFilterChildIdChange,
  childrenOptions = [],
  showUserFilter = false,
  holidaysMap = {},
  t,
  onEditEvent,
  onCreateOnDay,
}) {
  const anchorStable = normalizeAnchorMidday(anchorDate);
  const anchorMs = anchorStable.getTime();
  const todayStr = todayLocalYMD();

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => deriveCalendarRange(viewMode, anchorStable),
    [viewMode, anchorMs],
  );

  const monthCells = useMemo(() => {
    const y = anchorStable.getFullYear();
    const mo = anchorStable.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const firstDay = new Date(y, mo, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: '', date: '', events: [], other: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        date: dateStr,
        events: eventsForDay(events, dateStr),
        isToday: dateStr === todayStr,
        holiday: holidaysMap[dateStr] || null,
        other: false,
      });
    }
    return cells;
  }, [anchorMs, events, holidaysMap, todayStr]);

  const weekDates = useMemo(() => datesBetweenInclusive(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

  const dayAgendaEvents = useMemo(() => {
    const ds = formatLocalYMD(anchorStable);
    return sortByTime(eventsForDay(events, ds));
  }, [anchorMs, events]);

  const [detailDateStr, setDetailDateStr] = useState(null);
  /** Em semana/dia: dia com destaque dentro da coluna ou agenda */
  const [focusDayStr, setFocusDayStr] = useState(() => formatLocalYMD(anchorStable));

  useEffect(() => {
    setFocusDayStr(formatLocalYMD(anchorStable));
  }, [anchorMs]);

  const openDayDetail = (ds) => {
    if (!ds) return;
    setFocusDayStr(ds);
    setDetailDateStr(ds);
  };

  const closeDetail = () => setDetailDateStr(null);

  const detailEvents = detailDateStr ? sortByTime(eventsForDay(events, detailDateStr)) : [];

  const goPrev = () => onAnchorChange(navigateAnchor(viewMode, anchorStable, -1));
  const goNext = () => onAnchorChange(navigateAnchor(viewMode, anchorStable, 1));
  const goToday = () => {
    const n = normalizeAnchorMidday(new Date());
    onAnchorChange(n);
    if (viewMode === 'day') setFocusDayStr(formatLocalYMD(n));
    if (viewMode === 'week') setFocusDayStr(formatLocalYMD(n));
  };

  return (
    <div style={{ position: 'relative' }}>
      {loading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            right: 12,
            fontSize: '0.78rem',
            color: 'var(--text-light)',
          }}
        >
          A carregar…
        </div>
      )}

      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost" onClick={goPrev} aria-label="Anterior">
          ◀
        </button>
        <h2 style={{ fontWeight: 700, margin: 0, textAlign: 'center', flex: '1 1 200px' }}>
          {navigateTitle(viewMode, anchorStable, rangeFrom, rangeTo)}
        </h2>
        <button type="button" className="btn btn-ghost" onClick={goNext} aria-label="Próximo">
          ▶
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="calendar-views">
          <button
            type="button"
            className={`calendar-view-btn ${viewMode === 'month' ? 'active' : ''}`}
            onClick={() => onViewModeChange('month')}
          >
            Mês
          </button>
          <button
            type="button"
            className={`calendar-view-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => {
              setFocusDayStr(formatLocalYMD(anchorStable));
              onViewModeChange('week');
            }}
          >
            Semana
          </button>
          <button
            type="button"
            className={`calendar-view-btn ${viewMode === 'day' ? 'active' : ''}`}
            onClick={() => {
              const ds = formatLocalYMD(anchorStable);
              setFocusDayStr(ds);
              onViewModeChange('day');
            }}
          >
            Dia
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {showUserFilter && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'var(--text-light)', minWidth: 0 }}>
              <span>Utilizador</span>
              <select
                className="form-select"
                style={{ minWidth: 160, maxWidth: '100%' }}
                value={filterChildId}
                onChange={(e) => onFilterChildIdChange(e.target.value)}
              >
                <option value="all">Todos (visão geral)</option>
                {childrenOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>
            Hoje
          </button>
        </div>
      </div>

      {viewMode === 'month' && (
        <div className="calendar-grid-wrapper">
          <div className="calendar-grid">
            {WEEKD_SHORT_PT_GRID.map((d) => (
              <div key={d} className="calendar-header-cell">
                {d}
              </div>
            ))}
            {monthCells.map((cell, i) => (
              <div
                key={`c-${i}-${cell.date || i}`}
                className={`calendar-cell ${cell.isToday ? 'today' : ''} ${cell.other ? 'other-month' : ''}${
                  !cell.other && focusDayStr && cell.date === focusDayStr ? ' calendar-cell-focus' : ''
                }`}
                style={
                  cell.holiday && !cell.other ? { background: 'var(--danger)06' } : undefined
                }
                onClick={() => !cell.other && cell.day && openDayDetail(cell.date)}
                onKeyDown={(e) =>
                  !cell.other && cell.day && (e.key === 'Enter' || e.key === ' ') && openDayDetail(cell.date)}
                role={cell.other || !cell.day ? undefined : 'button'}
                tabIndex={cell.other || !cell.day ? undefined : 0}
              >
                {cell.day != null && cell.day !== '' && (
                  <div
                    className="calendar-day"
                    style={
                      cell.holiday && !cell.other ? { color: 'var(--danger)' } : undefined
                    }
                  >
                    {cell.day}
                  </div>
                )}
                {cell.holiday && !cell.other && (
                  <div className="calendar-holiday" title={cell.holiday}>
                    {cell.holiday}
                  </div>
                )}
                {sortByTime(cell.events || [])
                  .slice(0, 3)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="calendar-event"
                      style={{
                        background: calendarEventAccentColor(ev),
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof onEditEvent === 'function') onEditEvent(ev);
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}
                      </span>
                      {ev.time && (
                        <span style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: 4 }}>
                          {ev.time}
                        </span>
                      )}
                    </div>
                  ))}
                {(cell.events?.length || 0) > 3 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-light)' }}>
                    +{(cell.events || []).length - 3}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="calendar-week-shell">
          <div className="calendar-week-scroll">
            <div className="calendar-week-grid">
              {weekDates.map((ds) => {
                const [yt, mt, dd] = ds.slice(0, 10).split('-').map(Number);
                const dtLocal = new Date(yt, (mt || 1) - 1, dd || 1);
                const di = (dtLocal.getDay() + 6) % 7;
                const dlabel = WEEKD_SHORT_MON_PT[di];
                const columnEvents = sortByTime(eventsForDay(events, ds));
                const sel = ds === focusDayStr;
                return (
                  <div
                    key={ds}
                    className={`calendar-week-col ${ds === todayStr ? 'today' : ''} ${sel ? 'selected' : ''}`}
                    role="presentation"
                    onClick={() => openDayDetail(ds)}
                  >
                    <div className="calendar-week-col-head">
                      <span className="calendar-week-col-dow">{dlabel}</span>
                      <span className={`calendar-week-col-date ${todayStr === ds ? 'today' : ''}`}>
                        {parseInt(ds.slice(8, 10), 10)}
                      </span>
                    </div>
                    <div className="calendar-week-col-body">
                      {columnEvents.slice(0, 40).map((ev) => (
                        <button
                          type="button"
                          key={ev.id}
                          className="calendar-week-event-pill"
                          style={{ borderLeftColor: calendarEventAccentColor(ev) }}
                          onClick={(e) => {
                            e.stopPropagation();
                            typeof onEditEvent === 'function' && onEditEvent(ev);
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.time ? `${ev.time} ` : ''}
                            {ev.title}
                          </span>
                          {mode === 'parent' && ev.linked_user_label && (
                            <span style={{ opacity: 0.75, fontSize: '0.68rem', display: 'block' }}>
                              {ev.linked_user_label}
                            </span>
                          )}
                        </button>
                      ))}
                      {detailDateStr === ds && sel && (
                        <div className="calendar-week-highlight-hint">
                          <small>Seleção atual — detalhes abertos</small>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'day' && (
        <div className="card" style={{ padding: 16 }}>
          <div className="flex-between mb-12" style={{ flexWrap: 'wrap', gap: 8 }}>
            <strong>{weekdayLongPt(formatLocalYMD(anchorStable))}</strong>
            {holidaysMap[formatLocalYMD(anchorStable)] && (
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--danger)',
                  background: 'var(--danger)10',
                  padding: '2px 10px',
                  borderRadius: 20,
                }}
              >
                🎉 {holidaysMap[formatLocalYMD(anchorStable)]}
              </span>
            )}
          </div>
          {dayAgendaEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-light)' }}>
              Nenhum evento neste dia.
            </div>
          ) : (
            <ul className="calendar-day-agenda">
              {dayAgendaEvents.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    className="calendar-day-agenda-row"
                    onClick={() => typeof onEditEvent === 'function' && onEditEvent(ev)}
                  >
                    <span style={{ flex: '1 1 160px', minWidth: 0, fontWeight: 700, textAlign: 'left' }}>
                      {ev.title}
                    </span>
                    <span className="calendar-day-meta">
                      {ev.time || '—'}
                      {typeof t === 'function' && (
                        <span className="badge badge-info" style={{ fontSize: '0.72rem', marginLeft: 6 }}>
                          {t(ev.type)}
                        </span>
                      )}
                    </span>
                    <span className="calendar-day-linked">{ev.linked_user_label || '—'}</span>
                  </button>
                  {visibilityLabel(ev.visibility) && (
                    <span className="badge" style={{ fontSize: '0.72rem', marginTop: -4 }}>
                      {visibilityLabel(ev.visibility)}
                    </span>
                  )}
                  {ev.description && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', margin: '0 0 8px', paddingLeft: 8 }}>
                      {ev.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detailDateStr && (
        <div
          className="modal-overlay"
          role="presentation"
          style={{ zIndex: 910 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 560 }}
          >
            <div className="modal-header">
              <h2 className="modal-title">{weekdayLongPt(detailDateStr)}</h2>
              {holidaysMap[detailDateStr] && (
                <span style={{ marginTop: 6, marginRight: 32, fontSize: '0.82rem', color: 'var(--danger)' }}>
                  🎉 {holidaysMap[detailDateStr]}
                </span>
              )}
              <button type="button" className="modal-close" aria-label="Fechar" onClick={closeDetail}>
                ✕
              </button>
            </div>
            <div style={{ padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  typeof onCreateOnDay === 'function' && onCreateOnDay(detailDateStr, closeDetail)
                }
              >
                + Adicionar evento
              </button>
            </div>
            {detailEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px', color: 'var(--text-light)' }}>📭 Nenhum evento</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                {detailEvents.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 14px',
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: `4px solid ${calendarEventAccentColor(ev)}`,
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      typeof onEditEvent === 'function' &&
                      onEditEvent(ev)
                    }
                    onKeyDown={(e) =>
                      typeof onEditEvent === 'function' &&
                      e.key === 'Enter' &&
                      onEditEvent(ev)}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: 4,
                          gap: 8,
                        }}
                      >
                        <strong>{ev.title}</strong>
                        {ev.time && (
                          <span
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              color: 'var(--primary)',
                            }}
                          >
                            {ev.time}
                          </span>
                        )}
                      </div>
                      {typeof t === 'function' && (
                        <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                          {t(ev.type)}
                        </span>
                      )}
                      {(ev.linked_user_label || ev.child_name) && (
                        <div style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--text-light)' }}>
                          <strong>Vinculado:</strong>{' '}
                          {ev.linked_user_label || ev.child_name || '—'}
                        </div>
                      )}
                      {visibilityLabel(ev.visibility) && (
                        <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                          Estado/visibilidade: <strong>{visibilityLabel(ev.visibility)}</strong>
                        </div>
                      )}
                      {ev.description ? (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, var(--text-light))', margin: '8px 0 0' }}>
                          {ev.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={closeDetail}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
