import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import api, { publicAssetUrl } from '../services/api';

const RECORD_TYPES = ['flu', 'cold', 'headache', 'sore_throat', 'fever', 'cough', 'allergy', 'stomach_ache', 'malaise', 'other'];

function imgList(json) {
  if (!json) return [];
  try {
    const p = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function parseScheduledTimesFromMed(m) {
  try {
    if (m.scheduled_times) {
      const a = typeof m.scheduled_times === 'string' ? JSON.parse(m.scheduled_times) : m.scheduled_times;
      if (Array.isArray(a) && a.length) return a.map((x) => (x == null ? '' : String(x)));
    }
  } catch { /* ignore */ }
  if (m.scheduled_time) return [m.scheduled_time];
  return [''];
}

function formatMedTimesDisplay(m) {
  const arr = parseScheduledTimesFromMed(m).filter(Boolean);
  if (arr.length) return arr.join(' · ');
  return '';
}

function formatDateBr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function HealthAttachmentPicker({ urls, onChange, disabled, t, toast }) {
  const list = Array.isArray(urls) ? urls : [];
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/health/upload', fd);
      if (data?.url) onChange([...list, data.url]);
    } catch (err) {
      toast.error(err?.message || t('error_occurred'));
    }
    e.target.value = '';
  };
  return (
    <div className="form-group">
      <label className="form-label">{t('health_attachments_label')}</label>
      <input type="file" accept="image/*" className="form-input" disabled={disabled} onChange={upload} />
      <div className="flex gap-8 flex-wrap mt-8">
        {list.map((url) => (
          <div key={url} className="flex gap-8 align-center" style={{ alignItems: 'flex-start' }}>
            <img src={publicAssetUrl(url)} alt="" style={{ maxWidth: 72, borderRadius: 6 }} />
            {!disabled && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(list.filter((u) => u !== url))}>
                {t('health_remove_attachment')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HealthCenter() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [medications, setMedications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [children, setChildren] = useState([]);
  const [filters, setFilters] = useState({ child_id: '', status: '', med_status: '', from: '', to: '' });
  const [modal, setModal] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [hcContext, setHcContext] = useState(null);
  const [healthScope, setHealthScope] = useState('mine');
  // ID do registo na tabela children para o utilizador child atual
  const [myChildId, setMyChildId] = useState(null);

  const isChild = user?.role === 'child';
  const canManage = user?.role === 'parent' || user?.role === 'relative';
  const isParent = user?.role === 'parent';
  const isGestor = isParent && (user.access_profile ?? user.accessProfile ?? 'gestor') === 'gestor';

  // Carrega o ID do registo children para crianças autenticadas
  useEffect(() => {
    if (!isChild || !user?.id) return;
    api.get('/families/children').then((r) => {
      const me = (r.data || []).find((c) => c.user_id === user.id || c.id === user.id);
      if (me) setMyChildId(me.id);
    }).catch(() => {});
  }, [isChild, user?.id]);

  const applyPatientScopeParams = useCallback((q) => {
    if (user?.role === 'child') {
      // Criança só vê os seus próprios dados
      if (myChildId) q.set('child_id', myChildId);
      else if (user?.id) q.set('patient_user_id', user.id);
      return;
    }
    if (healthScope === 'mine' && user?.id) q.set('patient_user_id', user.id);
    else if (healthScope === 'children' && filters.child_id) q.set('child_id', filters.child_id);
  }, [user?.role, user?.id, healthScope, filters.child_id, myChildId]);

  const loadOverview = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      applyPatientScopeParams(q);
      const { data } = await api.get(`/health/overview?${q}`);
      setOverview(data);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [applyPatientScopeParams, toast, t]);

  const loadRecords = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      applyPatientScopeParams(q);
      if (filters.status) q.set('status', filters.status);
      if (filters.from) q.set('from', filters.from);
      if (filters.to) q.set('to', filters.to);
      const { data } = await api.get(`/health/records?${q}`);
      setRecords(data || []);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [applyPatientScopeParams, filters.status, filters.from, filters.to, toast, t]);

  const loadAppointments = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      applyPatientScopeParams(q);
      if (filters.from) q.set('from', filters.from);
      if (filters.to) q.set('to', filters.to);
      const { data } = await api.get(`/health/appointments?${q}`);
      setAppointments(data || []);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [applyPatientScopeParams, filters.from, filters.to, toast, t]);

  const loadMedications = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      applyPatientScopeParams(q);
      if (filters.med_status) q.set('status', filters.med_status);
      const { data } = await api.get(`/health/medications?${q}`);
      setMedications(data || []);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [applyPatientScopeParams, filters.med_status, toast, t]);

  const loadLogs = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      applyPatientScopeParams(q);
      if (filters.from) q.set('from', filters.from);
      if (filters.to) q.set('to', filters.to);
      const { data } = await api.get(`/health/medication-logs?${q}`);
      setLogs(data || []);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [applyPatientScopeParams, filters.from, filters.to, toast, t]);

  useEffect(() => {
    if (canManage) {
      Promise.all([
        api.get('/families/children').then((r) => r.data || []).catch(() => []),
        api.get('/health/context').then((r) => r.data).catch(() => null),
      ]).then(([ch, ctx]) => {
        setChildren(ch);
        setHcContext(ctx);
      });
    }
  }, [canManage]);

  useEffect(() => {
    if (hcContext?.showChildrenTab === false) setHealthScope('mine');
  }, [hcContext?.showChildrenTab]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Para crianças: recarrega dados quando myChildId fica disponível
  useEffect(() => {
    if (!isChild || !myChildId) return;
    loadOverview();
    loadMedications();
    loadLogs();
    if (tab === 'records') loadRecords();
    if (tab === 'appointments') loadAppointments();
  }, [myChildId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'records') loadRecords();
    if (tab === 'appointments') loadAppointments();
    if (tab === 'medications') {
      loadMedications();
      loadLogs();
    }
    if (tab === 'history') {
      loadRecords();
      loadLogs();
      loadAppointments();
    }
    if (tab === 'attachments') {
      loadRecords();
      loadAppointments();
      loadMedications();
    }
  }, [tab, loadRecords, loadAppointments, loadMedications, loadLogs]);

  useEffect(() => {
    if (tab === 'medications') {
      loadMedications();
      loadLogs();
    }
  }, [filters.med_status, filters.child_id, tab, loadMedications, loadLogs]);

  const buildRecordPayload = (m) => {
    const { kind: _k, ...rest } = m;
    const payload = { ...rest };
    if (payload.temperature === '' || payload.temperature === undefined) payload.temperature = null;
    payload.stayed_home = !!payload.stayed_home;
    payload.attachment_urls = Array.isArray(payload.attachment_urls) ? payload.attachment_urls : imgList(payload.attachment_urls);
    return payload;
  };

  const saveRecord = async (e) => {
    e.preventDefault();
    try {
      const payload = buildRecordPayload(modal);
      if (modal?.id) await api.put(`/health/records/${modal.id}`, payload);
      else await api.post('/health/records', payload);
      toast.success(t('fam_admin_saved'));
      setModal(null);
      loadRecords();
      loadOverview();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const deleteRecord = async (id) => {
    if (!confirm(t('health_confirm_delete'))) return;
    try {
      await api.delete(`/health/records/${id}`);
      toast.success(t('fam_admin_saved'));
      loadRecords();
      loadOverview();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const attachmentItems = useMemo(() => {
    const items = [];
    records.forEach((r) => {
      imgList(r.attachment_urls).forEach((url, i) => {
        items.push({
          key: `r-${r.id}-${i}`,
          caption: `${r.child_name} · ${t('health_attachment_record')} · ${t(`health_record_type_${r.record_type}`)}`,
          url,
        });
      });
    });
    appointments.forEach((a) => {
      imgList(a.attachment_urls).forEach((url, i) => {
        items.push({
          key: `a-${a.id}-${i}`,
          caption: `${a.child_name} · ${t('health_attachment_appointment')} · ${formatDateBr(a.appointment_date) || ''}`,
          url,
        });
      });
    });
    medications.forEach((m) => {
      if (m.prescription_image_url) {
        items.push({
          key: `m-${m.id}-rx`,
          caption: `${m.child_name} · ${t('health_attachment_prescription')} · ${m.name}`,
          url: m.prescription_image_url,
        });
      }
      imgList(m.attachment_urls).forEach((url, i) => {
        items.push({
          key: `m-${m.id}-x-${i}`,
          caption: `${m.child_name} · ${m.name} · ${t('health_extra_attachments')}`,
          url,
        });
      });
    });
    return items;
  }, [records, appointments, medications, t]);

  const openNewRecord = () => setModal({
    patient_mode: healthScope === 'children' ? 'child' : 'adult',
    child_id: filters.child_id || children[0]?.id || '',
    patient_user_id: healthScope === 'mine' ? (user?.id || '') : '',
    record_type: 'other',
    severity: 'mild',
    status: 'active',
    record_date: new Date().toISOString().split('T')[0],
    record_time: '',
    symptoms: '',
    notes: '',
    medication_given: '',
    stayed_home: false,
    temperature: '',
    attachment_urls: [],
  });

  return (
    <div className="animate-fade-in health-module">
      <div className="page-header">
        <h1 className="page-title">❤️ {t('health_page_title')}</h1>
        <p className="page-subtitle">{t('health_page_subtitle')}</p>
      </div>

      {!isChild && canManage && hcContext?.showChildrenTab && (
        <div className="tabs tabs-scroll mb-16">
          <button type="button" className={`tab ${healthScope === 'mine' ? 'active' : ''}`} onClick={() => setHealthScope('mine')}>
            {t('health_scope_mine')}
          </button>
          <button type="button" className={`tab ${healthScope === 'children' ? 'active' : ''}`} onClick={() => setHealthScope('children')}>
            {t('health_scope_children')}
          </button>
        </div>
      )}

      {canManage && (
        <div className="flex gap-12 mb-16 flex-wrap" style={{ alignItems: 'center' }}>
          {healthScope === 'children' && (
            <select className="form-select" style={{ maxWidth: 220 }} value={filters.child_id} onChange={(e) => setFilters((f) => ({ ...f, child_id: e.target.value }))}>
              <option value="">{t('health_filter_all_children')}</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input type="date" className="form-input" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <input type="date" className="form-input" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
      )}

      <div className="tabs tabs-scroll mb-24">
        {['overview', 'records', 'appointments', 'medications', 'history', 'attachments'].map((k) => (
          <button 
            key={k} 
            type="button" 
            className={`tab ${tab === k ? 'active' : ''}`} 
            onClick={() => setTab(k)}
          >
            {t(`health_tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && overview && (
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title mb-16">{t('health_upcoming_appointments')}</h3>
            {(overview.upcomingAppointments || []).length === 0 ? <p className="text-muted">{t('health_empty')}</p> : overview.upcomingAppointments.map((a) => (
              <div key={a.id} className="mb-12 pb-12" style={{ borderBottom: '1px solid var(--border)' }}>
                <strong>{a.child_name}</strong>
                {' — '}
                {formatDateBr(a.appointment_date)}
                {' '}
                {a.appointment_time || ''}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{a.specialty || '—'} · {t(`health_appt_status_${a.status}`)}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="card-title mb-16">{t('health_active_meds')}</h3>
            {(overview.activeMedications || []).length === 0 ? <p className="text-muted">{t('health_empty')}</p> : overview.activeMedications.map((m) => (
              <div key={m.id} className="mb-8"><strong>{m.name}</strong> · {m.child_name}</div>
            ))}
          </div>
          <div className="card">
            <h3 className="card-title mb-16">{t('health_recent_records')}</h3>
            {(overview.recentRecords || []).map((r) => (
              <div key={r.id} className="mb-8" style={{ fontSize: '0.9rem' }}>
                <strong>{r.child_name}</strong>
                {' — '}
                {t(`health_record_type_${r.record_type}`)}
                {' · '}
                {formatDateBr(r.record_date)}
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="card-title mb-16">{t('health_monitoring')}</h3>
            {(overview.monitoring || []).length === 0 ? <p className="text-muted">{t('health_empty')}</p> : overview.monitoring.map((r) => (
              <div key={r.id} className="mb-8">{r.child_name}: {r.symptoms || r.record_type}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'records' && (
        <div>
          {canManage && (
            <div className="flex-between mb-16 flex-wrap gap-12">
              <select className="form-select" style={{ maxWidth: 200 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">{t('health_filter_status')}</option>
                <option value="active">{t('health_status_active')}</option>
                <option value="resolved">{t('health_status_resolved')}</option>
                <option value="monitoring">{t('health_status_monitoring')}</option>
              </select>
              {!isChild && (
                <button type="button" className="btn btn-primary" onClick={openNewRecord}>
                  + {t('health_new_record')}
                </button>
              )}
            </div>
          )}
          {isChild && (
            <button type="button" className="btn btn-primary mb-16" onClick={() => setModal({
              record_type: 'other', severity: 'mild', status: 'active', symptoms: '', notes: '', medication_given: '', stayed_home: false,
              record_date: new Date().toISOString().split('T')[0], record_time: '', attachment_urls: [],
            })}
            >
              + {t('health_report_symptom')}
            </button>
          )}
          <div className="grid grid-2">
            {records.map((r) => (
              <div key={r.id} className="card">
                <div className="flex-between mb-8">
                  <strong>{r.child_name}</strong>
                  <span className="badge badge-info">{t(`health_record_type_${r.record_type}`)}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{formatDateBr(r.record_date)} {r.record_time || ''}</div>
                {r.symptoms && <p className="mt-8">{r.symptoms}</p>}
                {r.temperature != null && <p>{t('health_temperature')}: {r.temperature}</p>}
                {(r.medication_given || r.stayed_home) ? (
                  <p style={{ fontSize: '0.9rem' }}>
                    {r.medication_given ? `${t('health_medication_given')}: ${r.medication_given}` : null}
                    {r.medication_given && r.stayed_home ? ' · ' : null}
                    {r.stayed_home ? t('health_stayed_home_flag') : null}
                  </p>
                ) : null}
                <p>{t('health_severity')}: {t(`health_severity_${r.severity}`)} · {t('health_status_label')}: {t(`health_status_${r.status}`)}</p>
                {imgList(r.attachment_urls).map((url) => (
                  <img key={url} src={publicAssetUrl(url)} alt="" style={{ maxWidth: '100%', marginTop: 8, borderRadius: 8 }} />
                ))}
                {canManage && ['parent', 'relative'].includes(user.role) && (
                  <div className="flex gap-8 mt-12 flex-wrap">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal({
                      ...r,
                      attachment_urls: imgList(r.attachment_urls),
                      stayed_home: !!r.stayed_home,
                    })}
                    >{t('edit')}</button>
                    {(isGestor || r.created_by === user.id) && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteRecord(r.id)}>{t('health_delete_record')}</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'appointments' && canManage && (
        <div>
          <div className="flex-between mb-16">
            <h3>{t('health_tab_appointments')}</h3>
            <button type="button" className="btn btn-primary" onClick={() => setModal({
              kind: 'appt',
              patient_mode: healthScope === 'children' ? 'child' : 'adult',
              child_id: filters.child_id || children[0]?.id || '',
              patient_user_id: healthScope === 'mine' ? (user?.id || '') : '',
              appointment_date: '',
              appointment_time: '',
              specialty: '',
              professional_name: '',
              location: '',
              reason: '',
              diagnosis_notes: '',
              needs_followup: false,
              followup_date: '',
              status: 'scheduled',
              attachment_urls: [],
            })}
            >
              + {t('health_new_appointment')}
            </button>
          </div>
          <div className="grid grid-2">
            {appointments.map((a) => (
              <div key={a.id} className="card">
                <div className="flex-between mb-8 flex-wrap gap-8">
                  <strong>{a.child_name}</strong>
                  <span className="badge badge-primary">{t(`health_appt_status_${a.status}`)}</span>
                </div>
                <div><span style={{ fontWeight: 600 }}>{formatDateBr(a.appointment_date)}</span> {a.appointment_time || ''}</div>
                <div style={{ fontSize: '0.9rem', marginTop: 4 }}>{a.specialty || '—'} · {a.professional_name || '—'}</div>
                {a.location && <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{t('health_location')}: {a.location}</div>}
                {a.reason && <p className="mt-8" style={{ fontSize: '0.9rem' }}>{a.reason}</p>}
                {a.diagnosis_notes && <p style={{ fontSize: '0.85rem' }}>{t('health_diagnosis')}: {a.diagnosis_notes}</p>}
                {imgList(a.attachment_urls).map((url) => (
                  <img key={url} src={publicAssetUrl(url)} alt="" style={{ maxWidth: '100%', marginTop: 8, borderRadius: 8 }} />
                ))}
                <div className="flex gap-8 mt-12 flex-wrap">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal({
                    kind: 'appt',
                    ...a,
                    patient_mode: a.patient_user_id ? 'adult' : 'child',
                    patient_user_id: a.patient_user_id || '',
                    attachment_urls: imgList(a.attachment_urls),
                    needs_followup: !!a.needs_followup,
                  })}
                  >{t('edit')}</button>
                  {(isGestor || a.created_by === user.id) && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
                      if (!confirm(t('health_confirm_delete'))) return;
                      try {
                        await api.delete(`/health/appointments/${a.id}`);
                        toast.success(t('fam_admin_saved'));
                        loadAppointments();
                        loadOverview();
                      } catch {
                        toast.error(t('error_occurred'));
                      }
                    }}
                    >{t('health_delete_appointment')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'appointments' && !canManage && (
        <div className="grid grid-2">
          {appointments.map((a) => (
            <div key={a.id} className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}
              onClick={() => setSelectedAppt(a)}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-hover)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
            >
              <div className="flex-between mb-8">
                <span className="badge badge-primary">{t(`health_appt_status_${a.status}`)}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{formatDateBr(a.appointment_date)} {a.appointment_time || ''}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{a.specialty || t('health_appointment')}</div>
              {a.doctor_name && <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>👨‍⚕️ {a.doctor_name}</div>}
              {a.location && <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: 2 }}>📍 {a.location}</div>}
              {a.reason && <div style={{ fontSize: '0.85rem', marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>🗒️ {a.reason}</div>}
              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: 8, fontWeight: 600 }}>Toque para ver detalhes →</div>
            </div>
          ))}
          {appointments.length === 0 && <div className="card empty-state" style={{ gridColumn: '1/-1' }}><div className="empty-icon">📅</div><h3>{t('health_empty')}</h3></div>}
        </div>
      )}

      {tab === 'medications' && (
        <div>
          {canManage && (
            <div className="flex-between mb-16 flex-wrap gap-12">
              <select className="form-select" style={{ maxWidth: 200 }} value={filters.med_status} onChange={(e) => setFilters((f) => ({ ...f, med_status: e.target.value }))}>
                <option value="">{t('health_filter_med_status')}</option>
                <option value="active">{t('health_med_status_active')}</option>
                <option value="finished">{t('health_med_status_finished')}</option>
                <option value="suspended">{t('health_med_status_suspended')}</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={() => setModal({
                kind: 'med',
                patient_mode: healthScope === 'children' ? 'child' : 'adult',
                child_id: filters.child_id || children[0]?.id || '',
                patient_user_id: healthScope === 'mine' ? (user?.id || '') : '',
                name: '',
                dosage: '',
                frequency: '',
                start_date: '',
                end_date: '',
                scheduled_times: [''],
                notes: '',
                prescription_image_url: '',
                attachment_urls: [],
                status: 'active',
              })}
              >
                + {t('health_new_medication')}
              </button>
            </div>
          )}
          <div className="grid grid-2">
            {medications.map((m) => {
              const medLogs = logs.filter((l) => l.medication_id === m.id);
              return (
              <div key={m.id} className="card health-med-card">
                <div className="flex-between mb-8 flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
                  <strong style={{ minWidth: 0, wordBreak: 'break-word' }}>{m.name}</strong>
                  <span className="badge badge-info" style={{ flexShrink: 0 }}>{t(`health_med_status_${m.status}`)}</span>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text)' }}>👤 {m.child_name}</div>
                <div style={{ fontSize: '0.85rem', marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge badge-ghost">💊 {m.dosage}</span>
                  <span className="badge badge-ghost">🕒 {m.frequency}</span>
                </div>
                {formatMedTimesDisplay(m) && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: 8, background: 'var(--bg-hover)', padding: '6px 10px', borderRadius: 6 }}>
                    <strong>{t('health_schedule_times_label')}:</strong> {formatMedTimesDisplay(m)}
                  </div>
                )}
                {(m.start_date || m.end_date) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: 8 }}>
                    📅 {formatDateBr(m.start_date)} → {formatDateBr(m.end_date) || '—'}
                  </div>
                )}
                <div className="flex gap-8 mt-12" style={{ flexWrap: 'wrap' }}>
                  {m.prescription_image_url && <img src={publicAssetUrl(m.prescription_image_url)} alt="Prescrição" style={{ height: 60, width: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
                  {imgList(m.attachment_urls).map((url) => (
                    <img key={url} src={publicAssetUrl(url)} alt="Anexo" style={{ height: 60, width: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ))}
                </div>
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    📋 {t('health_recent_doses_heading')}
                  </div>
                  {medLogs.length === 0 ? (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{t('health_no_recent_doses')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {medLogs.slice(0, 5).map((l) => (
                        <div key={l.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: '0.82rem', rowGap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.status === 'taken' ? 'var(--success)' : l.status === 'skipped' ? 'var(--danger)' : 'var(--warning)', flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-light)' }}>{l.taken_at ? new Date(l.taken_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span className={`badge badge-${l.status === 'taken' ? 'success' : 'danger'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>{l.status === 'taken' ? 'Tomado' : 'Não tomado'}</span>
                          {l.logged_by_name && (
                            <span style={{ color: 'var(--text-light)', fontSize: '0.78rem', width: '100%', marginLeft: 0 }}>
                              {t('health_logged_by')} {l.logged_by_name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(canManage || isChild) && (
                  <div className="health-med-actions">
                    {canManage && isParent && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal({
                        kind: 'med',
                        ...m,
                        attachment_urls: imgList(m.attachment_urls),
                      })}
                      >{t('edit')}</button>
                    )}
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setLogModal({
                      medication_id: m.id,
                      medication_name: m.name,
                      child_id: m.child_id || myChildId,
                      taken_date: new Date().toISOString().split('T')[0],
                      taken_time: new Date().toTimeString().slice(0, 5),
                      status: 'taken',
                      notes: '',
                    })}
                    >💊 {t('health_add_log')}</button>
                    {(isGestor || m.created_by === user.id) && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
                        if (!confirm(t('health_confirm_delete'))) return;
                        try {
                          await api.delete(`/health/medications/${m.id}`);
                          toast.success(t('fam_admin_saved'));
                          loadMedications();
                          loadOverview();
                          loadLogs();
                        } catch {
                          toast.error(t('error_occurred'));
                        }
                      }}
                      >{t('health_delete_medication')}</button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-title">{t('health_logs_title')}</h3>
            {logs.map((l) => (
              <div key={l.id} className="mb-8 flex-between flex-wrap gap-8" style={{ fontSize: '0.9rem', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span><strong>{formatDateBr(l.taken_date)}</strong> — {l.medication_name} <span className="badge badge-ghost" style={{ marginLeft: 6 }}>{t(`health_log_status_${l.status}`)}</span></span>
                {isParent && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={async () => {
                    try {
                      await api.delete(`/health/medication-logs/${l.id}`);
                      loadLogs();
                    } catch {
                      toast.error(t('error_occurred'));
                    }
                  }}
                  >{t('health_delete_log')}</button>
                )}
              </div>
            ))}
          </div>
          <div className="card">
            <h3 className="card-title">{t('health_recent_records')}</h3>
            {records.slice(0, 15).map((r) => (
              <div key={r.id} className="mb-8 pb-8" style={{ borderBottom: '1px solid var(--border)' }}>
                <strong>{formatDateBr(r.record_date)}</strong>: {r.symptoms || r.record_type}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'attachments' && (
        <div className="grid grid-2">
          {attachmentItems.length === 0 ? (
            <div className="card"><p className="text-muted">{t('health_empty')}</p></div>
          ) : (
            attachmentItems.map((item) => (
              <div key={item.key} className="card">
                <p style={{ fontSize: '0.9rem', marginBottom: 12 }}>{item.caption}</p>
                <img src={publicAssetUrl(item.url)} alt="" style={{ maxWidth: 'min(100%, 360px)', borderRadius: 8 }} />
              </div>
            ))
          )}
        </div>
      )}

      {modal && !modal.kind && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{modal.id ? t('health_edit_record') : t('health_new_record')}</h2>
            <form onSubmit={saveRecord}>
              {!isChild && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('health_patient_type')}</label>
                    <select
                      className="form-select"
                      value={modal.patient_mode || 'child'}
                      onChange={(e) => setModal((m) => ({ ...m, patient_mode: e.target.value }))}
                    >
                      <option value="child">{t('health_patient_child')}</option>
                      <option value="adult">{t('health_patient_adult')}</option>
                    </select>
                  </div>
                  {modal.patient_mode === 'adult' ? (
                    <div className="form-group">
                      <label className="form-label">{t('health_pick_adult')}</label>
                      <select
                        required
                        className="form-select"
                        value={modal.patient_user_id || user?.id || ''}
                        onChange={(e) => setModal((m) => ({ ...m, patient_user_id: e.target.value }))}
                      >
                        {(hcContext?.adults?.length ? hcContext.adults : user?.id ? [{ id: user.id, name: user.name }] : []).map((ad) => (
                          <option key={ad.id} value={ad.id}>{ad.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">{t('health_child')}</label>
                      <select required className="form-select" value={modal.child_id} onChange={(e) => setModal((m) => ({ ...m, child_id: e.target.value }))}>
                        {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="form-group">
                <label className="form-label">{t('health_record_type')}</label>
                <select className="form-select" value={modal.record_type} onChange={(e) => setModal((m) => ({ ...m, record_type: e.target.value }))}>
                  {RECORD_TYPES.map((rt) => <option key={rt} value={rt}>{t(`health_record_type_${rt}`)}</option>)}
                </select>
              </div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('health_date')}</label><input required type="date" className="form-input" value={modal.record_date || ''} onChange={(e) => setModal((m) => ({ ...m, record_date: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{t('health_record_time')}</label><input type="time" className="form-input" value={modal.record_time || ''} onChange={(e) => setModal((m) => ({ ...m, record_time: e.target.value }))} /></div>
              </div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('health_temperature')}</label><input type="number" step="0.1" className="form-input" value={modal.temperature ?? ''} onChange={(e) => setModal((m) => ({ ...m, temperature: e.target.value === '' ? null : parseFloat(e.target.value) }))} /></div>
                {!isChild && (
                  <div className="form-group flex align-center" style={{ paddingTop: 28 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={!!modal.stayed_home} onChange={(e) => setModal((m) => ({ ...m, stayed_home: e.target.checked }))} />
                      {t('health_stayed_home')}
                    </label>
                  </div>
                )}
              </div>
              <div className="form-group"><label className="form-label">{t('health_symptoms')}</label><textarea className="form-textarea" value={modal.symptoms || ''} onChange={(e) => setModal((m) => ({ ...m, symptoms: e.target.value }))} /></div>
              {!isChild && (
                <div className="form-group"><label className="form-label">{t('health_medication_given')}</label><input className="form-input" value={modal.medication_given || ''} onChange={(e) => setModal((m) => ({ ...m, medication_given: e.target.value }))} placeholder={t('health_medication_given_ph')} /></div>
              )}
              <div className="form-group"><label className="form-label">{t('health_notes')}</label><textarea className="form-textarea" value={modal.notes || ''} onChange={(e) => setModal((m) => ({ ...m, notes: e.target.value }))} /></div>
              {!isChild && (
                <>
                  <div className="grid grid-2">
                    <div className="form-group">
                      <label className="form-label">{t('health_severity')}</label>
                      <select className="form-select" value={modal.severity} onChange={(e) => setModal((m) => ({ ...m, severity: e.target.value }))}>
                        <option value="mild">{t('health_severity_mild')}</option>
                        <option value="moderate">{t('health_severity_moderate')}</option>
                        <option value="high">{t('health_severity_high')}</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('health_status_label')}</label>
                      <select className="form-select" value={modal.status} onChange={(e) => setModal((m) => ({ ...m, status: e.target.value }))}>
                        <option value="active">{t('health_status_active')}</option>
                        <option value="monitoring">{t('health_status_monitoring')}</option>
                        <option value="resolved">{t('health_status_resolved')}</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              {!isChild && (
                <HealthAttachmentPicker
                  urls={modal.attachment_urls}
                  onChange={(urls) => setModal((m) => ({ ...m, attachment_urls: urls }))}
                  disabled={false}
                  t={t}
                  toast={toast}
                />
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.kind === 'appt' && (
        <AppointmentModal
          modal={modal}
          setModal={setModal}
          childrenList={children}
          adultsList={hcContext?.adults || []}
          t={t}
          toast={toast}
          onSaved={() => {
            const savedMode = modal?.patient_mode;
            const savedChildId = modal?.child_id;
            setModal(null);
            loadOverview();
            // Se guardou consulta de filho e scope está errado, muda scope
            // (o useEffect em loadAppointments vai disparar automaticamente quando scope muda)
            if (savedMode === 'child' && savedChildId && healthScope !== 'children') {
              setHealthScope('children');
              setFilters((f) => ({ ...f, child_id: savedChildId }));
            } else {
              loadAppointments();
            }
          }}
        />
      )}
      {modal?.kind === 'med' && (
        <MedicationModal
          modal={modal}
          setModal={setModal}
          childrenList={children}
          adultsList={hcContext?.adults || []}
          t={t}
          toast={toast}
          onSaved={() => { setModal(null); loadMedications(); loadOverview(); }}
        />
      )}

      {selectedAppt && (
        <div className="modal-overlay" onClick={() => setSelectedAppt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">📅 {t('health_appointment')}</h2>
              <button className="modal-close" onClick={() => setSelectedAppt(null)}>×</button>
            </div>
            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="flex-between">
                <span className={`badge badge-${selectedAppt.status === 'scheduled' ? 'primary' : selectedAppt.status === 'completed' ? 'success' : 'warning'}`}>
                  {t(`health_appt_status_${selectedAppt.status}`)}
                </span>
                <span style={{ fontWeight: 700 }}>{formatDateBr(selectedAppt.appointment_date)} {selectedAppt.appointment_time || ''}</span>
              </div>
              {selectedAppt.specialty && <div><strong>Especialidade:</strong> {selectedAppt.specialty}</div>}
              {selectedAppt.doctor_name && <div>👨‍⚕️ <strong>{t('health_doctor')}:</strong> {selectedAppt.doctor_name}</div>}
              {selectedAppt.location && <div>📍 <strong>{t('health_location')}:</strong> {selectedAppt.location}</div>}
              {selectedAppt.reason && <div>🗒️ <strong>{t('health_reason')}:</strong> {selectedAppt.reason}</div>}
              {selectedAppt.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: '0.9rem', color: 'var(--text-light)' }}>📝 {selectedAppt.notes}</div>}
              {imgList(selectedAppt.attachment_urls).length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('health_attachments_label')}</div>
                  <div className="flex gap-8 flex-wrap">
                    {imgList(selectedAppt.attachment_urls).map(url => (
                      <a key={url} href={publicAssetUrl(url)} target="_blank" rel="noreferrer">
                        <img src={publicAssetUrl(url)} alt="" style={{ height: 72, width: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setSelectedAppt(null)}>Fechar</button>
          </div>
        </div>
      )}

      {logModal && (
        <MedicationLogModal
          logModal={logModal}
          setLogModal={setLogModal}
          t={t}
          toast={toast}
          onSaved={() => { setLogModal(null); loadLogs(); }}
        />
      )}
    </div>
  );
}

function AppointmentModal({ modal, setModal, childrenList, adultsList = [], t, toast, onSaved }) {
  const isEdit = !!modal.id;
  const save = async (e) => {
    e.preventDefault();
    try {
      const {
        kind: _k,
        patient_mode: _pm,
        child_name: _cn,
        created_at: _ca,
        updated_at: _ua,
        ...rest
      } = modal;
      const payload = {
        ...rest,
        attachment_urls: Array.isArray(rest.attachment_urls) ? rest.attachment_urls : imgList(rest.attachment_urls),
        needs_followup: !!rest.needs_followup,
      };
      delete payload.patient_mode;
      if (modal.patient_mode === 'adult') {
        delete payload.child_id;
      } else {
        delete payload.patient_user_id;
      }
      if (isEdit) await api.put(`/health/appointments/${modal.id}`, payload);
      else await api.post('/health/appointments', payload);
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };
  return (
    <div className="modal-overlay" onClick={() => setModal(null)}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? t('health_edit_appointment') : t('health_new_appointment')}</h2>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">{t('health_patient_type')}</label>
            <select
              className="form-select"
              value={modal.patient_mode || 'child'}
              onChange={(e) => setModal((m) => ({ ...m, patient_mode: e.target.value }))}
            >
              <option value="child">{t('health_patient_child')}</option>
              <option value="adult">{t('health_patient_adult')}</option>
            </select>
          </div>
          {modal.patient_mode === 'adult' ? (
            <div className="form-group">
              <label className="form-label">{t('health_pick_adult')}</label>
              <select
                required
                className="form-select"
                value={modal.patient_user_id || ''}
                onChange={(e) => setModal((m) => ({ ...m, patient_user_id: e.target.value }))}
              >
                {adultsList.map((ad) => <option key={ad.id} value={ad.id}>{ad.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('health_child')}</label>
              <select required className="form-select" value={modal.child_id} onChange={(e) => setModal((m) => ({ ...m, child_id: e.target.value }))}>
                {childrenList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-2">
            <div className="form-group"><label className="form-label">{t('health_date')}</label><input required type="date" className="form-input" value={modal.appointment_date || ''} onChange={(e) => setModal((m) => ({ ...m, appointment_date: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">{t('health_time')}</label><input type="time" className="form-input" value={modal.appointment_time || ''} onChange={(e) => setModal((m) => ({ ...m, appointment_time: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">{t('health_specialty')}</label><input className="form-input" value={modal.specialty || ''} onChange={(e) => setModal((m) => ({ ...m, specialty: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{t('health_doctor')}</label><input className="form-input" value={modal.professional_name || ''} onChange={(e) => setModal((m) => ({ ...m, professional_name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{t('health_location')}</label><input className="form-input" value={modal.location || ''} onChange={(e) => setModal((m) => ({ ...m, location: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{t('health_reason')}</label><textarea className="form-textarea" value={modal.reason || ''} onChange={(e) => setModal((m) => ({ ...m, reason: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{t('health_diagnosis')}</label><textarea className="form-textarea" value={modal.diagnosis_notes || ''} onChange={(e) => setModal((m) => ({ ...m, diagnosis_notes: e.target.value }))} /></div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('health_appt_status_label')}</label>
              <select className="form-select" value={modal.status || 'scheduled'} onChange={(e) => setModal((m) => ({ ...m, status: e.target.value }))}>
                <option value="scheduled">{t('health_appt_status_scheduled')}</option>
                <option value="completed">{t('health_appt_status_completed')}</option>
                <option value="cancelled">{t('health_appt_status_cancelled')}</option>
              </select>
            </div>
            <div className="form-group flex align-center" style={{ paddingTop: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!modal.needs_followup} onChange={(e) => setModal((m) => ({ ...m, needs_followup: e.target.checked }))} />
                {t('health_needs_followup')}
              </label>
            </div>
          </div>
          {modal.needs_followup && (
            <div className="form-group"><label className="form-label">{t('health_followup_date')}</label><input type="date" className="form-input" value={modal.followup_date || ''} onChange={(e) => setModal((m) => ({ ...m, followup_date: e.target.value }))} /></div>
          )}
          <HealthAttachmentPicker
            urls={modal.attachment_urls}
            onChange={(urls) => setModal((m) => ({ ...m, attachment_urls: urls }))}
            disabled={false}
            t={t}
            toast={toast}
          />
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MedicationModal({ modal, setModal, childrenList, adultsList = [], t, toast, onSaved }) {
  const isEdit = !!modal.id;
  const rawSlots = modal.scheduled_times?.length ? modal.scheduled_times : [''];
  const doseCount = Math.min(8, Math.max(1, rawSlots.length));

  const uploadRx = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/health/upload', fd);
      if (data?.url) setModal((m) => ({ ...m, prescription_image_url: data.url }));
    } catch {
      toast.error(t('error_occurred'));
    }
    e.target.value = '';
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      const {
        kind: _k,
        patient_mode: _pmd,
        child_name: _cn,
        created_at: _ca,
        updated_at: _ua,
        scheduled_time: _st,
        ...rest
      } = modal;
      const times = (modal.scheduled_times || []).map((x) => String(x || '').trim()).filter(Boolean);
      const payload = {
        ...rest,
        scheduled_times: times,
        attachment_urls: Array.isArray(rest.attachment_urls) ? rest.attachment_urls : imgList(rest.attachment_urls),
      };
      delete payload.patient_mode;
      if (modal.patient_mode === 'adult') {
        delete payload.child_id;
      } else {
        delete payload.patient_user_id;
      }
      if (isEdit) await api.put(`/health/medications/${modal.id}`, payload);
      else await api.post('/health/medications', payload);
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };
  return (
    <div className="modal-overlay" onClick={() => setModal(null)}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? t('health_edit_medication') : t('health_new_medication')}</h2>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">{t('health_patient_type')}</label>
            <select
              className="form-select"
              value={modal.patient_mode || 'child'}
              onChange={(e) => setModal((m) => ({ ...m, patient_mode: e.target.value }))}
            >
              <option value="child">{t('health_patient_child')}</option>
              <option value="adult">{t('health_patient_adult')}</option>
            </select>
          </div>
          {modal.patient_mode === 'adult' ? (
            <div className="form-group">
              <label className="form-label">{t('health_pick_adult')}</label>
              <select required className="form-select" value={modal.patient_user_id || ''} onChange={(e) => setModal((m) => ({ ...m, patient_user_id: e.target.value }))}>
                {adultsList.map((ad) => <option key={ad.id} value={ad.id}>{ad.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('health_child')}</label>
              <select required className="form-select" value={modal.child_id} onChange={(e) => setModal((m) => ({ ...m, child_id: e.target.value }))}>
                {childrenList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group"><label className="form-label">{t('health_med_name')}</label><input required className="form-input" value={modal.name || ''} onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))} /></div>
          <div className="grid grid-2">
            <div className="form-group"><label className="form-label">{t('health_dosage')}</label><input className="form-input" value={modal.dosage || ''} onChange={(e) => setModal((m) => ({ ...m, dosage: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">{t('health_frequency')}</label><input className="form-input" value={modal.frequency || ''} onChange={(e) => setModal((m) => ({ ...m, frequency: e.target.value }))} placeholder={t('health_frequency_placeholder')} /></div>
          </div>
          <div className="grid grid-2">
            <div className="form-group"><label className="form-label">{t('health_start_date')}</label><input type="date" className="form-input" value={modal.start_date || ''} onChange={(e) => setModal((m) => ({ ...m, start_date: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">{t('health_end_date')}</label><input type="date" className="form-input" value={modal.end_date || ''} onChange={(e) => setModal((m) => ({ ...m, end_date: e.target.value }))} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('health_times_per_day')}</label>
            <select
              className="form-select"
              value={doseCount}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                const cur = modal.scheduled_times?.length ? [...modal.scheduled_times] : [''];
                const next = Array.from({ length: n }, (_, i) => cur[i] || '');
                setModal((m) => ({ ...m, scheduled_times: next }));
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>{t('health_dose_times_hint')}</p>
          </div>
          {Array.from({ length: doseCount }).map((_, i) => {
            const tm = (modal.scheduled_times || [])[i] ?? '';
            return (
              <div className="form-group" key={i}>
                <label className="form-label">{t('health_time_dose_label')} {i + 1}</label>
                <input
                  type="time"
                  className="form-input"
                  value={tm}
                  onChange={(e) => {
                    const next = [...(modal.scheduled_times?.length ? modal.scheduled_times : [])];
                    while (next.length < doseCount) next.push('');
                    next[i] = e.target.value;
                    setModal((m) => ({ ...m, scheduled_times: next }));
                  }}
                />
              </div>
            );
          })}
          <div className="form-group">
            <label className="form-label">{t('health_med_status_label')}</label>
            <select className="form-select" value={modal.status || 'active'} onChange={(e) => setModal((m) => ({ ...m, status: e.target.value }))}>
              <option value="active">{t('health_med_status_active')}</option>
              <option value="finished">{t('health_med_status_finished')}</option>
              <option value="suspended">{t('health_med_status_suspended')}</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">{t('health_notes')}</label><textarea className="form-textarea" value={modal.notes || ''} onChange={(e) => setModal((m) => ({ ...m, notes: e.target.value }))} /></div>
          <div className="form-group">
            <label className="form-label">{t('health_prescription_photo')}</label>
            <input type="file" accept="image/*" className="form-input" onChange={uploadRx} />
            {modal.prescription_image_url && (
              <div className="mt-8">
                <img src={publicAssetUrl(modal.prescription_image_url)} alt="" style={{ maxWidth: 160, borderRadius: 8 }} />
                <button type="button" className="btn btn-sm btn-ghost ml-8" onClick={() => setModal((m) => ({ ...m, prescription_image_url: '' }))}>{t('health_remove_attachment')}</button>
              </div>
            )}
          </div>
          <HealthAttachmentPicker
            urls={modal.attachment_urls}
            onChange={(urls) => setModal((m) => ({ ...m, attachment_urls: urls }))}
            disabled={false}
            t={t}
            toast={toast}
          />
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MedicationLogModal({ logModal, setLogModal, t, toast, onSaved }) {
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/health/medication-logs', {
        medication_id: logModal.medication_id,
        taken_date: logModal.taken_date,
        taken_time: logModal.taken_time || null,
        status: logModal.status,
        notes: logModal.notes || null,
      });
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch {
      toast.error(t('error_occurred'));
    }
  };
  return (
    <div className="modal-overlay" onClick={() => setLogModal(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t('health_add_log')} — {logModal.medication_name}</h2>
        <form onSubmit={save}>
          <div className="grid grid-2">
            <div className="form-group"><label className="form-label">{t('health_date')}</label><input required type="date" className="form-input" value={logModal.taken_date} onChange={(e) => setLogModal((m) => ({ ...m, taken_date: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">{t('health_time')}</label><input type="time" className="form-input" value={logModal.taken_time || ''} onChange={(e) => setLogModal((m) => ({ ...m, taken_time: e.target.value }))} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('health_log_status_label')}</label>
            <select className="form-select" value={logModal.status} onChange={(e) => setLogModal((m) => ({ ...m, status: e.target.value }))}>
              <option value="taken">{t('health_log_status_taken')}</option>
              <option value="skipped">{t('health_log_status_skipped')}</option>
              <option value="late">{t('health_log_status_late')}</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">{t('health_notes')}</label><textarea className="form-textarea" value={logModal.notes || ''} onChange={(e) => setLogModal((m) => ({ ...m, notes: e.target.value }))} /></div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setLogModal(null)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
