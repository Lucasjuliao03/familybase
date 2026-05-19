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

import { buildPeriodConfig, buildBoletim, scoreColor, scorePct } from '../../lib/gradesHelpers';

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
  const [settings, setSettings] = useState({}); // { [child_id]: { evaluation_model, ... } }
  const [periods, setPeriods] = useState({}); // { [child_id]: [ { period_number: 1, total_points: 25, approval_pct: 60, weight: 1 }, ... ] }
  const [settingsForm, setSettingsForm] = useState({ evaluation_model: 'bimonthly', periods: [] });
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

      const { data: sgpRows } = await supabase
        .from('school_grade_periods')
        .select('*')
        .eq('family_id', family.id)
        .order('period_number', { ascending: true });
      if (sgpRows) {
        const pMap = {};
        sgpRows.forEach((r) => {
          if (!pMap[r.child_id]) pMap[r.child_id] = [];
          pMap[r.child_id].push(r);
        });
        setPeriods(pMap);
      }
    }
  }, [filterChild, family?.id]);

  useEffect(() => { loadBundle(); }, [loadBundle, location.pathname]);
  useAutoRefresh(loadBundle, 2600);

  // Configuração ativa (apenas para fallback no modal se precisar)
  const activeSettings = (filterChild && settings[filterChild]) || { evaluation_model: 'bimonthly' };
  const periodLabels = PERIOD_LABELS[activeSettings.evaluation_model] || PERIOD_LABELS.bimonthly;

  // Filtrar notas por período
  const filteredGrades = grades.filter((g) => {
    if (filterPeriod && g.period_number !== filterPeriod) return false;
    return true;
  });

  // (calcChildMetrics removed)

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
      const { evaluation_model, periods: formPeriods, approval_pct } = settingsForm;
      const count = evaluation_model === 'trimester' ? 3 : 4;
      const validPeriods = formPeriods.slice(0, count);
      
      const totalPoints = validPeriods.reduce((sum, p) => sum + (Number(p.total_points) || 0), 0);

      const payload = {
        family_id: family.id,
        child_id: filterChild,
        evaluation_model,
        periods_count: count,
        annual_total_points: totalPoints,
        approval_pct: Number(approval_pct),
      };
      const { error: err1 } = await supabase.from('school_grade_settings').upsert(payload, { onConflict: 'family_id,child_id' });
      if (err1) throw err1;

      // Upsert periods
      for (const p of validPeriods) {
        const pPayload = {
          family_id: family.id,
          child_id: filterChild,
          period_number: p.period_number,
          period_label: p.period_label || `Período ${p.period_number}`,
          total_points: Number(p.total_points),
          approval_pct: Number(p.approval_pct),
          weight: Number(p.weight),
        };
        const { error: err2 } = await supabase.from('school_grade_periods').upsert(pPayload, { onConflict: 'family_id,child_id,period_number' });
        if (err2) throw err2;
      }

      toast.success('Configuração salva!');
      loadBundle();
    } catch (e) { toast.error(e.message || t('error_occurred')); }
    setSavingSettings(false);
  };

  // Quando troca filho ou modelo, atualiza o form
  useEffect(() => {
    if (!filterChild) return;
    const s = settings[filterChild] || { evaluation_model: 'bimonthly', approval_pct: 60 };
    const pCfg = buildPeriodConfig(s, periods[filterChild] || []);
    setSettingsForm({ 
      evaluation_model: s.evaluation_model, 
      approval_pct: s.approval_pct || 60,
      periods: pCfg 
    });
  }, [filterChild, settings, periods]);

  const handlePeriodChange = (idx, field, val) => {
    setSettingsForm(prev => {
      const newP = [...prev.periods];
      newP[idx] = { ...newP[idx], [field]: val };
      return { ...prev, periods: newP };
    });
  };

  const handleModelChange = (model) => {
    setSettingsForm(prev => {
      const pCfg = buildPeriodConfig({ evaluation_model: model, approval_pct: prev.approval_pct }, periods[filterChild] || []);
      return { ...prev, evaluation_model: model, periods: pCfg };
    });
  };

  const selectedChildGrades = filterChild ? grades.filter((g) => g.child_id === filterChild) : grades;

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

      {/* ── DASHBOARD (BOLETIM) ── */}
      {activeTab === 'dashboard' && (
        <div>
          {!filterChild ? (
            <div className="card empty-state">
              <div className="empty-icon">📊</div>
              <h3>Selecione um Aluno</h3>
              <p>Escolha um aluno no filtro acima para ver o boletim.</p>
            </div>
          ) : (() => {
            const childSettings = settings[filterChild] || { evaluation_model: 'bimonthly', approval_pct: 60 };
            const childPeriods = periods[filterChild] || [];
            const pConfig = buildPeriodConfig(childSettings, childPeriods);
            const boletim = buildBoletim(selectedChildGrades, pConfig);

            return (
              <>
                {/* Resumo Geral */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <div className="stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>Média Final</div>
                    <div style={{ fontWeight: 800, fontSize: '1.6rem', color: boletim.overall.passed ? 'var(--success)' : 'var(--text)' }}>
                      {boletim.overall.weightedAvg.toFixed(1)}
                    </div>
                  </div>
                  <div className="stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>Pontos Acumulados</div>
                    <div style={{ fontWeight: 800, fontSize: '1.6rem' }}>
                      {boletim.overall.totalObtained.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>de {boletim.overall.totalMax}</div>
                  </div>
                  {boletim.overall.missing > 0 && (
                    <div className="stat-card" style={{ padding: '14px 16px', borderColor: '#F97316', background: 'rgba(249,115,22,0.05)' }}>
                      <div style={{ fontSize: '0.72rem', color: '#F97316', marginBottom: 4 }}>Faltam na Média</div>
                      <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#F97316' }}>{boletim.overall.missing.toFixed(1)}</div>
                    </div>
                  )}
                  {boletim.overall.passed && (
                    <div className="stat-card" style={{ padding: '14px 16px', borderColor: 'var(--success)', background: 'rgba(34,197,94,0.05)' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginBottom: 4 }}>Situação</div>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--success)', marginTop: 4 }}>Aprovado 🎉</div>
                    </div>
                  )}
                </div>

                {/* Boletim Detalhado por Período */}
                {boletim.periods.map((p) => (
                  <div key={p.number} className="card mb-16" style={{ padding: '16px' }}>
                    <div className="flex-between mb-12" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                      <div>
                        <h3 style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.label}</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: 2 }}>
                          Meta: {p.min_score}pts ({p.approval_pct}%) • Peso: {p.weight}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: scoreColor(p.obtained, p.total_points, p.approval_pct) }}>
                          {p.obtained.toFixed(1)} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {p.total_points}pts</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: p.passed ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {p.passed ? 'Atingiu a meta' : 'Abaixo da meta'}
                        </div>
                      </div>
                    </div>

                    {/* Matérias neste período */}
                    {Object.keys(p.subjects).length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Nenhuma nota registrada neste período.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        {Object.entries(p.subjects).map(([subj, data]) => (
                          <div key={subj} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                            <div className="flex-between mb-6">
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{subj}</span>
                              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>
                                {data.total.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>/{data.max}</span>
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                              Média: {data.avg !== null ? data.avg.toFixed(1) : '-'} • {data.grades.length} nota(s)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
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
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>⚙️ Configuração de Boletim</h3>
            {!filterChild ? (
              <p style={{ color: 'var(--text-light)', fontSize: '0.88rem', marginBottom: 12 }}>
                Selecione um aluno no filtro acima para configurar o boletim.
              </p>
            ) : (
              <>
                <div className="form-group mb-20">
                  <label className="form-label">Modelo de avaliação</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['bimonthly', '📅 4 Bimestres'], ['trimester', '📆 3 Trimestres']].map(([val, label]) => (
                      <button
                        key={val} type="button"
                        onClick={() => handleModelChange(val)}
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

                <div className="form-group mb-24">
                  <label className="form-label">Porcentagem Padrão para Aprovação Geral (%)</label>
                  <input type="number" min="0" max="100" className="form-input" value={settingsForm.approval_pct || ''}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, approval_pct: e.target.value }))} />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Essa porcentagem será aplicada a todos os períodos (ex: 60%).
                  </p>
                </div>

                <h4 style={{ fontWeight: 600, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  Configuração por Período
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  {settingsForm.periods.slice(0, settingsForm.evaluation_model === 'trimester' ? 3 : 4).map((p, idx) => (
                    <div key={p.number} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: 10 }}>{p.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Pontos Totais</label>
                          <input type="number" step="0.1" className="form-input" value={p.total_points}
                            onChange={(e) => handlePeriodChange(idx, 'total_points', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Aprovação (%)</label>
                          <input type="number" step="1" className="form-input" value={p.approval_pct}
                            onChange={(e) => handlePeriodChange(idx, 'approval_pct', e.target.value)} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Peso na Média</label>
                          <input type="number" step="0.1" className="form-input" value={p.weight}
                            onChange={(e) => handlePeriodChange(idx, 'weight', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex-between" style={{ alignItems: 'center' }}>
                  <div style={{ fontSize: '0.85rem' }}>
                    <strong>Total no Ano:</strong> {settingsForm.periods.slice(0, settingsForm.evaluation_model === 'trimester' ? 3 : 4).reduce((s, p) => s + (Number(p.total_points) || 0), 0)} pts
                  </div>
                  <button className="btn btn-primary" disabled={savingSettings} onClick={handleSaveSettings}>
                    {savingSettings ? 'Salvando...' : '💾 Salvar Configuração'}
                  </button>
                </div>
              </>
            )}
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
