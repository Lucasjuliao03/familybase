import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import api, { publicAssetUrl } from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';
import useAutoRefresh from '../../hooks/useAutoRefresh';

const PREDEFINED_SUBJECTS = [
  'Matemática','Português','Ciências','História','Geografia',
  'Educação Física','Artes','Inglês','Espanhol','Física',
  'Química','Biologia','Filosofia','Sociologia','Música',
];

const PERIOD_LABELS = {
  bimonthly: ['1º Bimestre','2º Bimestre','3º Bimestre','4º Bimestre'],
  trimester:  ['1º Trimestre','2º Trimestre','3º Trimestre'],
};

function ScoreBar({ value, max, minAvg }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= minAvg ? 'var(--success)' : value >= minAvg * 0.75 ? '#F97316' : 'var(--danger)';
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

export default function GradeTracker() {
  const { t } = useLanguage();
  const toast = useToast();
  const { family } = useAuth();
  const location = useLocation();

  const [grades, setGrades] = useState([]);
  const [children, setChildren] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [filterChild, setFilterChild] = useState('');
  const [filterPeriod, setFilterPeriod] = useState(0); // 0 = todos
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'grades' | 'settings'
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState({}); // { [child_id]: { evaluation_model, minimum_average, ... } }
  const [settingsForm, setSettingsForm] = useState({ evaluation_model: 'bimonthly', minimum_average: 6, annual_total_points: 100 });
  const [savingSettings, setSavingSettings] = useState(false);

  const [form, setForm] = useState({
    subject: '', type: 'test', score: '', max_score: 10,
    concept: '', observation: '', date: '', child_id: '', period_number: 1,
  });

  const loadBundle = useCallback(async () => {
    const params = {};
    if (filterChild) params.child_id = filterChild;
    try {
      const { data } = await api.get('/grades', { params });
      setGrades(data || []);
    } catch { /* manter estado anterior */ }
    api.get('/families/children').then((r) => setChildren(r.data || [])).catch(() => {});
    api.get('/grades/subjects')
      .then((r) => {
        const extra = (r.data || []).filter((s) => !PREDEFINED_SUBJECTS.includes(s));
        setSubjectOptions([...PREDEFINED_SUBJECTS, ...extra]);
      })
      .catch(() => setSubjectOptions(PREDEFINED_SUBJECTS));

    // Carregar configurações de avaliação via Supabase direto
    if (family?.id) {
      const { data: sgsRows } = await supabase
        .from('school_grade_settings')
        .select('*')
        .eq('family_id', family.id);
      if (sgsRows) {
        const map = {};
        sgsRows.forEach((r) => { map[r.child_id] = r; });
        setSettings(map);
      }
    }
  }, [filterChild, family?.id]);

  useEffect(() => { loadBundle(); }, [loadBundle, location.pathname]);
  useAutoRefresh(loadBundle, 2600);

  // Configuração ativa para o filho selecionado
  const activeSettings = (filterChild && settings[filterChild]) || {
    evaluation_model: 'bimonthly',
    minimum_average: 6,
    annual_total_points: 100,
    period_total_points: 25,
    periods_count: 4,
  };
  const periodLabels = PERIOD_LABELS[activeSettings.evaluation_model] || PERIOD_LABELS.bimonthly;

  // Filtrar notas por período
  const filteredGrades = grades.filter((g) => {
    if (filterPeriod && g.period_number !== filterPeriod) return false;
    return true;
  });

  // Calcular métricas por filho
  function calcChildMetrics(childGrades, cfg) {
    const minAvg = cfg.minimum_average ?? 6;
    const annualMax = cfg.annual_total_points ?? 100;
    const bySubject = {};
    childGrades.forEach((g) => {
      if (!bySubject[g.subject]) bySubject[g.subject] = [];
      bySubject[g.subject].push(g);
    });
    const totalScore = childGrades.reduce((s, g) => s + (g.score ?? 0), 0);
    const overallAvg = annualMax > 0 ? (totalScore / annualMax) * 10 : null;
    const atRisk = Object.entries(bySubject).filter(([, gs]) => {
      const sc = gs.filter((g) => g.score != null);
      if (!sc.length) return false;
      const avg = sc.reduce((a, g) => a + g.score, 0) / sc.length;
      return avg < minAvg;
    }).map(([subj]) => subj);
    const missing = overallAvg !== null ? Math.max(0, minAvg - overallAvg) : null;
    return { bySubject, totalScore, overallAvg, atRisk, missing, minAvg };
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/grades', {
        ...form,
        score: parseFloat(form.score),
        max_score: parseFloat(form.max_score),
        period_number: Number(form.period_number),
        period_type: activeSettings.evaluation_model,
      });
      toast.success(t('grade_added'));
      setShowModal(false);
      loadBundle();
      setForm({ subject: '', type: 'test', score: '', max_score: 10, concept: '', observation: '', date: '', child_id: '', period_number: 1 });
    } catch { toast.error(t('error_occurred')); }
  };

  const handleSaveSettings = async () => {
    if (!filterChild) { toast.error('Selecione um aluno primeiro.'); return; }
    setSavingSettings(true);
    try {
      const payload = {
        family_id: family.id,
        child_id: filterChild,
        evaluation_model: settingsForm.evaluation_model,
        minimum_average: Number(settingsForm.minimum_average),
        annual_total_points: Number(settingsForm.annual_total_points),
        periods_count: settingsForm.evaluation_model === 'trimester' ? 3 : 4,
        period_total_points: Number(settingsForm.annual_total_points) / (settingsForm.evaluation_model === 'trimester' ? 3 : 4),
      };
      const { error } = await supabase.from('school_grade_settings').upsert(payload, { onConflict: 'family_id,child_id' });
      if (error) throw error;
      toast.success('Configuração salva!');
      loadBundle();
    } catch (e) { toast.error(e.message || t('error_occurred')); }
    setSavingSettings(false);
  };

  // Quando troca filho, preenche o form de settings com os dados existentes
  useEffect(() => {
    if (filterChild && settings[filterChild]) {
      const s = settings[filterChild];
      setSettingsForm({ evaluation_model: s.evaluation_model, minimum_average: s.minimum_average, annual_total_points: s.annual_total_points });
    } else {
      setSettingsForm({ evaluation_model: 'bimonthly', minimum_average: 6, annual_total_points: 100 });
    }
  }, [filterChild, settings]);

  const scoreColor = (score, max) => {
    const p = score / max;
    if (p >= 0.7) return 'var(--success)';
    if (p >= 0.5) return '#F97316';
    return 'var(--danger)';
  };

  // Métricas do filho selecionado (para dashboard)
  const selectedChildGrades = filterChild ? grades.filter((g) => g.child_id === filterChild || g.student_id === filterChild) : grades;
  const metrics = calcChildMetrics(selectedChildGrades, activeSettings);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">📚 {t('grade_tracking')}</h1>
          <p className="page-subtitle" style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Acompanhe o desempenho escolar</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ {t('add_grade')}</button>
      </div>

      {/* Filtros */}
      <div className="flex gap-10 mb-16" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={filterChild} onChange={(e) => setFilterChild(e.target.value)}>
          <option value="">Todos os alunos</option>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto', minWidth: 130 }} value={filterPeriod} onChange={(e) => setFilterPeriod(Number(e.target.value))}>
          <option value={0}>Todos os períodos</option>
          {periodLabels.map((l, i) => <option key={i + 1} value={i + 1}>{l}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-scroll mb-20" style={{ margin: 0 }}>
        {[['dashboard','📊 Dashboard'],['grades','📋 Notas'],['settings','⚙️ Configuração']].map(([k, l]) => (
          <button key={k} type="button" className={`tab ${activeTab === k ? 'active' : ''}`} onClick={() => setActiveTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Cards compactos por aluno */}
          {Object.keys(metrics.bySubject).length === 0 ? (
            <div className="card empty-state"><div className="empty-icon">📊</div><h3>Sem notas ainda</h3><p>Cadastre notas para ver o dashboard.</p></div>
          ) : (
            <>
              {/* Resumo geral */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>Média Geral</div>
                  <div style={{ fontWeight: 800, fontSize: '1.6rem', color: metrics.overallAvg != null && metrics.overallAvg >= activeSettings.minimum_average ? 'var(--success)' : 'var(--danger)' }}>
                    {metrics.overallAvg != null ? metrics.overallAvg.toFixed(1) : '-'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>mín. {activeSettings.minimum_average}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>Total de Notas</div>
                  <div style={{ fontWeight: 800, fontSize: '1.6rem' }}>{selectedChildGrades.length}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>Pontos Total</div>
                  <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{metrics.totalScore.toFixed(1)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>de {activeSettings.annual_total_points}</div>
                </div>
                {metrics.atRisk.length > 0 && (
                  <div className="stat-card" style={{ padding: '14px 16px', borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.05)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginBottom: 4 }}>⚠️ Em Risco</div>
                    <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--danger)' }}>{metrics.atRisk.length}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>matéria{metrics.atRisk.length > 1 ? 's' : ''}</div>
                  </div>
                )}
              </div>

              {/* Alerta de risco */}
              {metrics.atRisk.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.3rem' }}>⚠️</span>
                  <div>
                    <strong style={{ color: 'var(--danger)' }}>Atenção: matérias abaixo da média</strong>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: 4 }}>{metrics.atRisk.join(' • ')}</p>
                  </div>
                </div>
              )}

              {/* Por matéria */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(metrics.bySubject).map(([subj, gs]) => {
                  const scored = gs.filter((g) => g.score != null);
                  const avg = scored.length ? scored.reduce((a, g) => a + g.score, 0) / scored.length : null;
                  const isRisk = metrics.atRisk.includes(subj);
                  return (
                    <div key={subj} style={{ background: 'var(--bg-card)', border: `1px solid ${isRisk ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px' }}>
                      <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{isRisk ? '⚠️ ' : ''}{subj}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{scored.length} nota{scored.length !== 1 ? 's' : ''}</div>
                        </div>
                        {avg != null && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ fontWeight: 800, fontSize: '1.15rem', color: scoreColor(avg, activeSettings.minimum_average > 0 ? activeSettings.minimum_average * 1.67 : 10) }}>
                              {avg.toFixed(1)}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}> /10</span>
                          </div>
                        )}
                      </div>
                      {avg != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <ScoreBar value={avg} max={10} minAvg={activeSettings.minimum_average} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── NOTAS ── */}
      {activeTab === 'grades' && (
        <div className="table-container">
          <table className="table-stack-md">
            <thead>
              <tr>
                <th>{t('subject')}</th><th>{t('select_child')}</th><th>Período</th>
                <th>{t('grade_type')}</th><th>{t('score')}</th><th>{t('date')}</th><th>{t('observation')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>{t('no_grades')}</td></tr>
              ) : filteredGrades.map((g) => (
                <tr key={g.id}>
                  <td data-label={t('subject')}><strong>{g.subject}</strong></td>
                  <td data-label={t('select_child')}>
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: g.child_color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '0.72rem' }}>
                        {g.avatar_url ? <img src={publicAssetUrl(g.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (g.avatar_preset ? PRESET_AVATARS.find((a) => a.id === g.avatar_preset)?.emoji : g.child_name?.[0])}
                      </div>
                      {g.child_name}
                    </div>
                  </td>
                  <td data-label="Período">
                    <span className="badge badge-ghost" style={{ fontSize: '0.72rem' }}>
                      {g.period_number ? (PERIOD_LABELS[g.period_type || 'bimonthly']?.[g.period_number - 1] || `P${g.period_number}`) : '-'}
                    </span>
                  </td>
                  <td data-label={t('grade_type')}><span className="badge badge-info">{t(g.type)}</span></td>
                  <td data-label={t('score')}>
                    <span style={{ fontWeight: 700, color: g.score >= (g.max_score * 0.7) ? 'var(--success)' : g.score >= (g.max_score * 0.5) ? '#F97316' : 'var(--danger)' }}>
                      {g.score}/{g.max_score}
                    </span>
                  </td>
                  <td data-label={t('date')}>{g.date ? new Date(g.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                  <td data-label={t('observation')} style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{g.observation || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CONFIGURAÇÃO ── */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: 480 }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>⚙️ Modelo de Avaliação</h3>
            {!filterChild && (
              <p style={{ color: 'var(--text-light)', fontSize: '0.88rem', marginBottom: 12 }}>
                Selecione um aluno no filtro acima para salvar a configuração.
              </p>
            )}
            <div className="form-group">
              <label className="form-label">Modelo de avaliação</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['bimonthly', '📅 4 Bimestres'], ['trimester', '📆 3 Trimestres']].map(([val, label]) => (
                  <button
                    key={val} type="button"
                    onClick={() => setSettingsForm((p) => ({ ...p, evaluation_model: val }))}
                    style={{
                      padding: '14px 10px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                      border: `2px solid ${settingsForm.evaluation_model === val ? 'var(--primary)' : 'var(--border)'}`,
                      background: settingsForm.evaluation_model === val ? 'rgba(99,102,241,0.08)' : 'var(--bg)',
                      color: settingsForm.evaluation_model === val ? 'var(--primary)' : 'var(--text)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">Nota mínima para aprovação</label>
                <input type="number" step="0.1" min="0" max="10" className="form-input" value={settingsForm.minimum_average}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, minimum_average: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Total de pontos no ano</label>
                <input type="number" min="1" className="form-input" value={settingsForm.annual_total_points}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, annual_total_points: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" disabled={savingSettings || !filterChild} onClick={handleSaveSettings}>
              {savingSettings ? 'Salvando...' : '💾 Salvar Configuração'}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Nova Nota */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t('add_grade')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('select_child')} *</label>
                  <select className="form-select" value={form.child_id} onChange={(e) => setForm((p) => ({ ...p, child_id: e.target.value }))} required>
                    <option value="">--</option>
                    {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('subject')} *</label>
                  <input className="form-input" list="subj-list" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Selecione ou digite..." required />
                  <datalist id="subj-list">{subjectOptions.map((s) => <option key={s} value={s} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-3">
                <div className="form-group">
                  <label className="form-label">Período</label>
                  <select className="form-select" value={form.period_number} onChange={(e) => setForm((p) => ({ ...p, period_number: e.target.value }))}>
                    {periodLabels.map((l, i) => <option key={i + 1} value={i + 1}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('score')}</label>
                  <input className="form-input" type="number" step="0.1" value={form.score} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('max_score')}</label>
                  <input className="form-input" type="number" value={form.max_score} onChange={(e) => setForm((p) => ({ ...p, max_score: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('grade_type')}</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    {['test','homework','project','concept','participation'].map((tp) => <option key={tp} value={tp}>{t(tp)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('date')}</label>
                  <input className="form-input" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('observation')}</label>
                <textarea className="form-textarea" value={form.observation} onChange={(e) => setForm((p) => ({ ...p, observation: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
