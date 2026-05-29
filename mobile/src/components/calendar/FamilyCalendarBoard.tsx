import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Colors, Radii, FontSize, Shadow } from '../../theme';
import { calendarEventAccentColor } from '../../shared/lib/userDisplayColors';
import {
  deriveCalendarRange,
  navigateAnchor,
  formatLocalYMD,
  formatDateBR,
  todayLocalYMD,
  normalizeAnchorMidday,
  datesBetweenInclusive,
} from '../../shared/lib/familyCalendarRange';

const SCREEN_W = Dimensions.get('window').width;
const GRID_PAD = 16;
const CELL_W = Math.floor((SCREEN_W - GRID_PAD * 2) / 7);

const MONTH_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKD_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKD_SHORT_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export type CalendarViewMode = 'month' | 'week' | 'day';

export interface CalendarEventItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: string;
  child_id?: string;
  child_name?: string;
  child_color?: string;
  color?: string;
  linked_user_label?: string;
  description?: string;
}

function weekdayLongPt(ds: string): string {
  const [y, m, d] = ds.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const names = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `${names[dt.getDay()]}, ${formatDateBR(ds)}`;
}

function formatEventDateTime(ev: CalendarEventItem): string {
  const datePart = formatDateBR(ev.date);
  if (ev.time) return `${datePart} · ${ev.time.slice(0, 5)}`;
  return datePart;
}

type LegendItem = { key: string; label: string; color: string };

function buildLegendItems(
  events: CalendarEventItem[],
  childrenOptions: { id: string; name: string; color?: string }[],
): LegendItem[] {
  const map = new Map<string, LegendItem>();

  map.set('family', { key: 'family', label: 'Família', color: Colors.primary });

  for (const c of childrenOptions) {
    map.set(`child:${c.id}`, {
      key: `child:${c.id}`,
      label: c.name,
      color: c.color || Colors.primary,
    });
  }

  for (const ev of events) {
    const color = calendarEventAccentColor(ev);
    if (ev.child_id) {
      const label = ev.child_name || childrenOptions.find((c) => c.id === ev.child_id)?.name || 'Filho';
      map.set(`child:${ev.child_id}`, { key: `child:${ev.child_id}`, label, color });
    } else if (ev.linked_user_label) {
      map.set(`user:${ev.linked_user_label}`, {
        key: `user:${ev.linked_user_label}`,
        label: ev.linked_user_label,
        color,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.key === 'family') return -1;
    if (b.key === 'family') return 1;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

function sortUpcoming(events: CalendarEventItem[], todayStr: string, limit = 8): CalendarEventItem[] {
  return [...events]
    .filter((e) => e?.date && e.date >= todayStr)
    .sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return String(a.time).localeCompare(String(b.time));
    })
    .slice(0, limit);
}

function navigateTitle(viewMode: CalendarViewMode, anchor: Date, fromStr: string, toStr: string): string {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();
  if (viewMode === 'month') return `${MONTH_PT[m]} ${y}`;
  if (viewMode === 'week' && fromStr && toStr) return `${formatDateBR(fromStr)} – ${formatDateBR(toStr)}`;
  return weekdayLongPt(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

function eventsForDay(events: CalendarEventItem[], ds: string): CalendarEventItem[] {
  return (events || []).filter((e) => e?.date === ds);
}

function sortByTime(events: CalendarEventItem[]): CalendarEventItem[] {
  return [...events].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return String(a.time).localeCompare(String(b.time));
  });
}

function typeShortLabel(type: string): string {
  const map: Record<string, string> = {
    school: 'Escolar',
    health: 'Saúde',
    family: 'Família',
    leisure: 'Lazer',
  };
  return map[type] || type;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    school: '📚 Escolar',
    health: '💊 Saúde',
    family: '🏠 Família',
    leisure: '🎪 Lazer',
  };
  return map[type] || type;
}

interface FamilyCalendarBoardProps {
  mode?: 'parent' | 'child';
  events: CalendarEventItem[];
  loading?: boolean;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  anchorDate: Date;
  onAnchorChange: (d: Date) => void;
  filterChildId?: string;
  onFilterChildIdChange?: (id: string) => void;
  childrenOptions?: { id: string; name: string; color?: string }[];
  showUserFilter?: boolean;
  upcomingEvents?: CalendarEventItem[];
  onEditEvent?: (ev: CalendarEventItem) => void;
  onCreateOnDay?: (dateStr: string) => void;
}

export function FamilyCalendarBoard({
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
  upcomingEvents,
  onEditEvent,
  onCreateOnDay,
}: FamilyCalendarBoardProps) {
  const anchorStable = normalizeAnchorMidday(anchorDate);
  const todayStr = todayLocalYMD();
  const [detailDateStr, setDetailDateStr] = useState<string | null>(null);
  const [focusDayStr, setFocusDayStr] = useState(() => formatLocalYMD(anchorStable));

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => deriveCalendarRange(viewMode, anchorStable),
    [viewMode, anchorStable.getTime()],
  );

  useEffect(() => {
    setFocusDayStr(formatLocalYMD(anchorStable));
  }, [anchorStable.getTime()]);

  const monthCells = useMemo(() => {
    const y = anchorStable.getFullYear();
    const mo = anchorStable.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const firstDay = new Date(y, mo, 1).getDay();
    const cells: Array<{
      day: number | '';
      date: string;
      events: CalendarEventItem[];
      isToday?: boolean;
      other: boolean;
    }> = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: '', date: '', events: [], other: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        date: dateStr,
        events: eventsForDay(events, dateStr),
        isToday: dateStr === todayStr,
        other: false,
      });
    }
    return cells;
  }, [anchorStable.getTime(), events, todayStr]);

  const weekDates = useMemo(() => datesBetweenInclusive(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

  const dayAgendaEvents = useMemo(() => {
    const ds = formatLocalYMD(anchorStable);
    return sortByTime(eventsForDay(events, ds));
  }, [anchorStable.getTime(), events]);

  const detailEvents = detailDateStr ? sortByTime(eventsForDay(events, detailDateStr)) : [];

  const legendItems = useMemo(
    () => buildLegendItems([...events, ...(upcomingEvents || [])], childrenOptions),
    [events, upcomingEvents, childrenOptions],
  );

  const upcomingList = useMemo(() => {
    const pool = upcomingEvents && upcomingEvents.length > 0 ? upcomingEvents : events;
    return sortUpcoming(pool, todayStr, 8);
  }, [upcomingEvents, events, todayStr]);

  const openDayDetail = (ds: string) => {
    if (!ds) return;
    setFocusDayStr(ds);
    setDetailDateStr(ds);
  };

  const goPrev = () => onAnchorChange(navigateAnchor(viewMode, anchorStable, -1));
  const goNext = () => onAnchorChange(navigateAnchor(viewMode, anchorStable, 1));
  const goToday = () => {
    const n = normalizeAnchorMidday(new Date());
    onAnchorChange(n);
    setFocusDayStr(formatLocalYMD(n));
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.rootContent} showsVerticalScrollIndicator={false}>
      {loading && (
        <View style={s.loadingBadge}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={s.loadingText}>A carregar…</Text>
        </View>
      )}

      {/* Navegação */}
      <View style={s.navRow}>
        <TouchableOpacity style={s.navBtn} onPress={goPrev} activeOpacity={0.7}>
          <Text style={s.navBtnText}>◀</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={2}>
          {navigateTitle(viewMode, anchorStable, rangeFrom, rangeTo)}
        </Text>
        <TouchableOpacity style={s.navBtn} onPress={goNext} activeOpacity={0.7}>
          <Text style={s.navBtnText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Modos + Hoje + filtro */}
      <View style={s.toolbar}>
        <View style={s.viewModes}>
          {(['month', 'week', 'day'] as CalendarViewMode[]).map((vm) => (
            <TouchableOpacity
              key={vm}
              style={[s.viewBtn, viewMode === vm && s.viewBtnActive]}
              onPress={() => {
                if (vm === 'week' || vm === 'day') setFocusDayStr(formatLocalYMD(anchorStable));
                onViewModeChange(vm);
              }}
              activeOpacity={0.8}
            >
              <Text style={[s.viewBtnText, viewMode === vm && s.viewBtnTextActive]}>
                {vm === 'month' ? 'Mês' : vm === 'week' ? 'Semana' : 'Dia'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.todayBtn} onPress={goToday} activeOpacity={0.8}>
          <Text style={s.todayBtnText}>Hoje</Text>
        </TouchableOpacity>
      </View>

      {showUserFilter && onFilterChildIdChange && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
          <TouchableOpacity
            style={[s.filterChip, filterChildId === 'all' && s.filterChipActive]}
            onPress={() => onFilterChildIdChange('all')}
          >
            <Text style={[s.filterChipText, filterChildId === 'all' && s.filterChipTextActive]}>Todos</Text>
          </TouchableOpacity>
          {childrenOptions.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.filterChip, filterChildId === c.id && s.filterChipActive]}
              onPress={() => onFilterChildIdChange(c.id)}
            >
              <Text style={[s.filterChipText, filterChildId === c.id && s.filterChipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── MÊS ── */}
      {viewMode === 'month' && (
        <View style={s.monthWrap}>
          <View style={s.weekHeader}>
            {WEEKD_SHORT.map((d) => (
              <View key={d} style={[s.weekHeaderCell, { width: CELL_W }]}>
                <Text style={s.weekHeaderText}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={s.monthGrid}>
            {monthCells.map((cell, i) => {
              const selected = !cell.other && focusDayStr === cell.date;
              return (
                <TouchableOpacity
                  key={`c-${i}-${cell.date || i}`}
                  style={[
                    s.monthCell,
                    { width: CELL_W, minHeight: CELL_W * 0.95 },
                    cell.isToday && s.monthCellToday,
                    selected && s.monthCellSelected,
                    cell.other && s.monthCellOther,
                  ]}
                  disabled={cell.other || !cell.day}
                  onPress={() => cell.date && openDayDetail(cell.date)}
                  activeOpacity={0.7}
                >
                  {cell.day !== '' && (
                    <Text style={[s.dayNum, cell.isToday && s.dayNumToday]}>{cell.day}</Text>
                  )}
                  {sortByTime(cell.events).slice(0, 2).map((ev) => (
                    <View
                      key={ev.id}
                      style={[s.eventPill, { backgroundColor: calendarEventAccentColor(ev) }]}
                    >
                      <Text style={s.eventPillText} numberOfLines={1}>{ev.title}</Text>
                    </View>
                  ))}
                  {cell.events.length > 2 && (
                    <Text style={s.moreEvents}>+{cell.events.length - 2}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── SEMANA ── */}
      {viewMode === 'week' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekScroll} nestedScrollEnabled>
          <View style={s.weekRow}>
            {weekDates.map((ds) => {
              const [yt, mt, dd] = ds.slice(0, 10).split('-').map(Number);
              const dtLocal = new Date(yt, (mt || 1) - 1, dd || 1);
              const di = (dtLocal.getDay() + 6) % 7;
              const columnEvents = sortByTime(eventsForDay(events, ds));
              const sel = ds === focusDayStr;
              return (
                <TouchableOpacity
                  key={ds}
                  style={[
                    s.weekCol,
                    ds === todayStr && s.weekColToday,
                    sel && s.weekColSelected,
                  ]}
                  onPress={() => openDayDetail(ds)}
                  activeOpacity={0.85}
                >
                  <View style={s.weekColHead}>
                    <Text style={s.weekColDow}>{WEEKD_SHORT_MON[di]}</Text>
                    <Text style={[s.weekColDate, ds === todayStr && s.weekColDateToday]}>
                      {parseInt(ds.slice(8, 10), 10)}
                    </Text>
                  </View>
                  <View style={s.weekColBody}>
                    {columnEvents.slice(0, 8).map((ev) => (
                      <TouchableOpacity
                        key={ev.id}
                        style={[s.weekEventPill, { borderLeftColor: calendarEventAccentColor(ev) }]}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onEditEvent?.(ev);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={s.weekEventTitle} numberOfLines={2}>
                          {ev.time ? `${ev.time.slice(0, 5)} ` : ''}{ev.title}
                        </Text>
                        {mode === 'parent' && ev.linked_user_label ? (
                          <Text style={s.weekEventSub} numberOfLines={1}>{ev.linked_user_label}</Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── DIA ── */}
      {viewMode === 'day' && (
        <View style={s.dayCard}>
          <Text style={s.dayTitle}>{weekdayLongPt(formatLocalYMD(anchorStable))}</Text>
          {dayAgendaEvents.length === 0 ? (
            <View style={s.dayEmpty}>
              <Text style={s.dayEmptyText}>Nenhum evento neste dia.</Text>
              {onCreateOnDay && (
                <TouchableOpacity style={s.addDayBtn} onPress={() => onCreateOnDay(formatLocalYMD(anchorStable))}>
                  <Text style={s.addDayBtnText}>+ Adicionar evento</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            dayAgendaEvents.map((ev) => (
              <TouchableOpacity
                key={ev.id}
                style={[s.dayEventRow, { borderLeftColor: calendarEventAccentColor(ev) }]}
                onPress={() => onEditEvent?.(ev)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.dayEventTitle}>{ev.title}</Text>
                  <Text style={s.dayEventMeta}>
                    {ev.time ? ev.time.slice(0, 5) : '—'} · {typeLabel(ev.type)}
                  </Text>
                  {(ev.linked_user_label || ev.child_name) && (
                    <Text style={s.dayEventLinked}>{ev.linked_user_label || ev.child_name}</Text>
                  )}
                  {ev.description ? (
                    <Text style={s.dayEventDesc} numberOfLines={2}>{ev.description}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Legenda de cores */}
      {legendItems.length > 0 && (
        <View style={s.legendWrap}>
          <Text style={s.legendTitle}>Legenda</Text>
          <View style={s.legendRow}>
            {legendItems.map((item) => (
              <View key={item.key} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: item.color }]} />
                <Text style={s.legendLabel} numberOfLines={1}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Próximos eventos */}
      <View style={s.upcomingWrap}>
        <Text style={s.upcomingTitle}>Próximos eventos</Text>
        {upcomingList.length === 0 ? (
          <Text style={s.upcomingEmpty}>Nenhum evento agendado a partir de hoje.</Text>
        ) : (
          upcomingList.map((ev) => (
            <TouchableOpacity
              key={`up-${ev.id}`}
              style={[s.upcomingRow, { borderLeftColor: calendarEventAccentColor(ev) }]}
              onPress={() => onEditEvent?.(ev)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.upcomingEventTitle} numberOfLines={1}>{ev.title}</Text>
                <Text style={s.upcomingEventMeta}>{formatEventDateTime(ev)}</Text>
                {(ev.linked_user_label || ev.child_name) && (
                  <Text style={s.upcomingEventUser} numberOfLines={1}>
                    {ev.child_name || ev.linked_user_label}
                  </Text>
                )}
              </View>
              <Text style={s.upcomingEventType}>{typeShortLabel(ev.type)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Modal detalhe do dia */}
      <Modal visible={!!detailDateStr} transparent animationType="slide" onRequestClose={() => setDetailDateStr(null)}>
        <View style={s.modalOverlay}>
          <Pressable style={s.modalBackdrop} onPress={() => setDetailDateStr(null)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{detailDateStr ? weekdayLongPt(detailDateStr) : ''}</Text>
            {onCreateOnDay && detailDateStr && (
              <TouchableOpacity
                style={s.addDayBtn}
                onPress={() => {
                  onCreateOnDay(detailDateStr);
                  setDetailDateStr(null);
                }}
              >
                <Text style={s.addDayBtnText}>+ Adicionar evento</Text>
              </TouchableOpacity>
            )}
            {detailEvents.length === 0 ? (
              <Text style={s.dayEmptyText}>📭 Nenhum evento</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {detailEvents.map((ev) => (
                  <TouchableOpacity
                    key={ev.id}
                    style={[s.detailEvent, { borderLeftColor: calendarEventAccentColor(ev) }]}
                    onPress={() => {
                      setDetailDateStr(null);
                      onEditEvent?.(ev);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={s.detailEventHeader}>
                      <Text style={s.detailEventTitle}>{ev.title}</Text>
                      {ev.time ? <Text style={s.detailEventTime}>{ev.time.slice(0, 5)}</Text> : null}
                    </View>
                    <Text style={s.detailEventType}>{typeLabel(ev.type)}</Text>
                    {(ev.linked_user_label || ev.child_name) && (
                      <Text style={s.detailEventLinked}>
                        Vinculado: {ev.linked_user_label || ev.child_name}
                      </Text>
                    )}
                    {ev.description ? <Text style={s.detailEventDesc}>{ev.description}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setDetailDateStr(null)}>
              <Text style={s.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  rootContent: { paddingBottom: 24 },
  loadingBadge: {
    position: 'absolute', top: 4, right: 12, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radii.full, ...Shadow.sm,
  },
  loadingText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 10, gap: 8 },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  navBtnText: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '800', color: Colors.text },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GRID_PAD, marginBottom: 10, gap: 8 },
  viewModes: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 3, borderWidth: 1, borderColor: Colors.border, flex: 1 },
  viewBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radii.sm },
  viewBtnActive: { backgroundColor: Colors.primary, ...Shadow.sm },
  viewBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  viewBtnTextActive: { color: Colors.white },
  todayBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.md, backgroundColor: Colors.primaryLighter, borderWidth: 1, borderColor: Colors.primary },
  todayBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  filterScroll: { marginBottom: 8, maxHeight: 44 },
  filterRow: { paddingHorizontal: GRID_PAD, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primaryLighter, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.primary, fontWeight: '700' },

  monthWrap: { paddingHorizontal: GRID_PAD, paddingBottom: 16 },
  weekHeader: { flexDirection: 'row', marginBottom: 4 },
  weekHeaderCell: { alignItems: 'center', paddingVertical: 6 },
  weekHeaderText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 3, backgroundColor: Colors.surface,
  },
  monthCellToday: { backgroundColor: Colors.primaryLighter, borderColor: Colors.primary },
  monthCellSelected: { borderColor: Colors.primary, borderWidth: 2 },
  monthCellOther: { backgroundColor: Colors.bg, opacity: 0.4 },
  dayNum: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  dayNumToday: { color: Colors.primary },
  eventPill: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginBottom: 2 },
  eventPillText: { fontSize: 8, color: Colors.white, fontWeight: '700' },
  moreEvents: { fontSize: 8, color: Colors.textMuted, fontWeight: '600' },

  weekScroll: { minHeight: 300 },
  weekRow: { flexDirection: 'row', paddingHorizontal: GRID_PAD, paddingBottom: 16, gap: 8 },
  weekCol: {
    width: Math.max(100, SCREEN_W * 0.28),
    minHeight: 280,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  weekColToday: { borderColor: Colors.primary },
  weekColSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLighter },
  weekColHead: { alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.bg },
  weekColDow: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  weekColDate: { fontSize: 20, fontWeight: '900', color: Colors.text },
  weekColDateToday: { color: Colors.primary },
  weekColBody: { padding: 6, gap: 6, flex: 1 },
  weekEventPill: {
    backgroundColor: Colors.bg, borderRadius: Radii.sm, padding: 8,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  weekEventTitle: { fontSize: 11, fontWeight: '700', color: Colors.text },
  weekEventSub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },

  dayCard: {
    marginHorizontal: GRID_PAD, marginBottom: 16,
    backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadow.sm,
  },
  dayTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  dayEmpty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  dayEmptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  addDayBtn: {
    alignSelf: 'flex-start', backgroundColor: Colors.primaryLighter,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.md, marginBottom: 12,
  },
  addDayBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  dayEventRow: {
    flexDirection: 'row', padding: 12, marginBottom: 8,
    backgroundColor: Colors.bg, borderRadius: Radii.md,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  dayEventTitle: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  dayEventMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  dayEventLinked: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  dayEventDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 6, fontStyle: 'italic' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30,11,75,0.45)',
  },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32, maxHeight: '85%', ...Shadow.lg,
  },
  modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 12 },
  modalTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  detailEvent: {
    padding: 14, marginBottom: 10, backgroundColor: Colors.bg,
    borderRadius: Radii.md, borderLeftWidth: 4,
  },
  detailEventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  detailEventTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  detailEventTime: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  detailEventType: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  detailEventLinked: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  detailEventDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 6 },
  modalCloseBtn: { marginTop: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.bg, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border },
  modalCloseText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },

  legendWrap: {
    marginHorizontal: GRID_PAD,
    marginTop: 8,
    marginBottom: 12,
    padding: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '48%',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    flexShrink: 1,
  },

  upcomingWrap: {
    marginHorizontal: GRID_PAD,
    marginBottom: 8,
  },
  upcomingTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
  },
  upcomingEmpty: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
  },
  upcomingEventTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
  },
  upcomingEventMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 3,
    fontWeight: '600',
  },
  upcomingEventUser: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  upcomingEventType: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    maxWidth: 56,
    textAlign: 'right',
  },
});
