import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { supabase } from '../../lib/supabase';
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

function MiniBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 5, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

export default function MyGrades() {
  const { childProfile, ensureChildProfile, family } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();

  const [grades, setGrades] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState(0);
  const [settings, setSettings] = useState({
    evaluation_model: 'bimonthly', minimum_average: 6,
    annual_total_points: 100, period_total_points: 25, periods_count: 4,
  });
  const [form, setForm] = useState({
    subject: '', type: 'test', score: '', max_score: '10',
    concept: '', observation: '', date: '', period_number: 1,
  });

  const loadBundle = useCallback(async () => {
    try {
      const { data } = await api.get('/grades');
      setGrades(data || []);
    } catch { /* manter estado anterior */ }

    api.get('/grades/subjects')
      .then((r) => {
        const extra = (r.data || []).filter((s) => !PREDEFINED_SUBJECTS.includes(s));
        setSubjectOptions([...PREDEFINED_SUBJECTS, ...extra]);
      })
      .catch(() => setSubjectOptions(PREDEFINED_SUBJECTS));

    // Carregar configuração do aluno
    const cid = childProfile?.id;
    if (cid && family?.id) {
      const { data: cfg } = await supabase
        .from('school_grade_settings')
        .select('*')
        .eq('family_id', family.id)
        .eq('child_id', cid)
        .maybeSingle();
      if (cfg) setSettings(cfg);
    }
  }, [childProfile?.id, family?.id]);

  useEffect(() => { loadBundle(); }, [loadBundle, location.pathname]);
  useAutoRefresh(loadBundle, 2600);

  const periodLabels = PERIOD_LABELS[settings.evaluation_model] || PERIOD_LABELS.bimonthly;

  // Filtrar por período
  const filteredGrades = filterPeriod ? grades.filter((g) => g.period_number === filterPeriod) : grades;

  // Agrupar por matéria
  const bySubject = {};
  filteredGrades.forEach((g) => { if (!bySubject[g.subject]) bySubject[g.subject] = []; bySubject[g.subject].push(g); });

  // Métricas gerais
  const scored = filteredGrades.filter((g) => g.score != null);
  const totalScore = scored.reduce((s, g) => s + g.score, 0);
  const overallAvg = settings.annual_total_points > 0
    ? (totalScore / (filterPeriod ? settings.period_total_points || 25 : settings.annual_total_points)) * 10
    : null;
  const missing = overallAvg !== null ? Math.max(0, settings.minimum_average - overallAvg) : 0;
  const atRisk = Object.entries(bySubject).filter(([, gs]) => {
    const sc = gs.filter((g) => g.score != null);
    if (!sc.length) return false;
    return sc.reduce((a, g) => a + g.score, 0) / sc.length < settings.minimum_average;
  }).map(([s]) => s);

  const scoreColor = (avg) => {
    if (avg >= settings.minimum_average) return 'var(--success)';
    if (avg >= settings.minimum_average * 0.75) return '#F97316';
    return 'var(--danger)';
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    let row = childProfile;
    if (!row?.id) row = await ensureChildProfile();
    if (!row?.id) { toast.error('Perfil em carregamento. Tente dentro de instantes.'); return; }
    try {
      await api.post('/grades', {
        ...form,
        child_id: row.id,
        score: form.score !== '' ? parseFloat(form.score) : null,
        max_score: parseFloat(form.max_score) || 10,
        period_number: Number(form.period_number),
        period_type: settings.evaluation_model,
      });
      toast.success('Nota cadastrada! 📚');
      setShowModal(false);
      setForm({ subject: '', type: 'test', score: '', max_score: '10', concept: '', observation: '', date: '', period_number: 1 });
      loadBundle();
    } catch (err) { toast.error(err.response?.data?.error || err.message || t('error_occurred')); }
  };

  const typeLabels = { test:'Prova', homework:'Dever', project:'Projeto', concept:'Conceito', participation:'Participação' };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ minWidth: 0 }}>📚 {t('my_grades')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>+ Cadastrar Nota</button>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filterPeriod === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(0)}>Todos</button>
        {periodLabels.map((l, i) => (
          <button key={i + 1} className={`btn btn-sm ${filterPeriod === i + 1 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(i + 1)}>{l}</button>
        ))}
      </div>

      {/* Dashboard compacto */}
      {grades.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          <div className="stat-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: 2 }}>Média Geral</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: overallAvg != null ? scoreColor(overallAvg) : 'var(--text)' }}>
              {overallAvg != null ? overallAvg.toFixed(1) : '-'}
            </div>
            <MiniBar value={overallAvg ?? 0} max={10} color={overallAvg != null && overallAvg >= settings.minimum_average ? 'var(--success)' : 'var(--danger)'} />
          </div>
          <div className="stat-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: 2 }}>Pontos</div>
            <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{totalScore.toFixed(1)}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>de {filterPeriod ? (settings.period_total_points ?? 25) : settings.annual_total_points}</div>
          </div>
          {missing > 0 && (
            <div className="stat-card" style={{ padding: '12px 14px', borderColor: '#F97316', background: 'rgba(249,115,22,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: '#F97316', marginBottom: 2 }}>Faltam</div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#F97316' }}>{missing.toFixed(1)}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>p/ média {settings.minimum_average}</div>
            </div>
          )}
          {atRisk.length > 0 && (
            <div className="stat-card" style={{ padding: '12px 14px', borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginBottom: 2 }}>⚠️ Em Risco</div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--danger)' }}>{atRisk.length}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>matéria{atRisk.length > 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      )}

      {/* Alerta de risco */}
      {atRisk.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid var(--danger)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
          <strong style={{ color: 'var(--danger)' }}>⚠️ Matérias abaixo da média:</strong>{' '}
          <span style={{ color: 'var(--text-light)' }}>{atRisk.join(' • ')}</span>
        </div>
      )}

      {/* Cards por matéria (compactos) */}
      {Object.keys(bySubject).length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📚</div>
          <h3>{t('no_grades')}</h3>
          <p style={{ color: 'var(--text-light)' }}>Cadastre sua primeira nota!</p>
        </div>
      ) : Object.entries(bySubject).map(([subj, gs]) => {
        const sc = gs.filter((g) => g.score != null);
        const avg = sc.length ? sc.reduce((a, g) => a + g.score, 0) / sc.length : null;
        const isRisk = atRisk.includes(subj);
        return (
          <div key={subj} className="card mb-12" style={{ border: `1px solid ${isRisk ? 'var(--danger)' : 'var(--border)'}`, padding: '14px 16px' }}>
            <div className="flex-between mb-10" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: 0 }}>
                {isRisk ? '⚠️ ' : '📖 '}{subj}
              </h3>
              {avg != null && (
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: scoreColor(avg) }}>
                  {avg.toFixed(1)}/10
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 110px), 1fr))', gap: 8 }}>
              {gs.map((g) => (
                <div key={g.id} style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-light)', marginBottom: 2 }}>{typeLabels[g.type] || g.type}</div>
                  {g.score != null ? (
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: scoreColor(g.score * 10 / g.max_score) }}>
                      {g.score}<span style={{ fontSize: '0.7rem', fontWeight: 400 }}>/{g.max_score}</span>
                    </div>
                  ) : (
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>{g.concept || '-'}</div>
                  )}
                  {g.date && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{new Date(g.date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📚 Cadastrar Nota</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Disciplina *</label>
                <input className="form-input" list="subj-c" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Selecione ou digite..." required />
                <datalist id="subj-c">{subjectOptions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Período</label>
                  <select className="form-select" value={form.period_number} onChange={(e) => setForm((p) => ({ ...p, period_number: e.target.value }))}>
                    {periodLabels.map((l, i) => <option key={i + 1} value={i + 1}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="test">Prova</option>
                    <option value="homework">Dever de Casa</option>
                    <option value="project">Projeto</option>
                    <option value="concept">Conceito</option>
                    <option value="participation">Participação</option>
                  </select>
                </div>
              </div>
              {form.type !== 'concept' ? (
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Nota obtida</label>
                    <input className="form-input" type="number" step="0.1" min="0" value={form.score} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} placeholder="Ex: 8.5" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nota máxima</label>
                    <input className="form-input" type="number" step="0.1" min="1" value={form.max_score} onChange={(e) => setForm((p) => ({ ...p, max_score: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Conceito</label>
                  <select className="form-select" value={form.concept} onChange={(e) => setForm((p) => ({ ...p, concept: e.target.value }))}>
                    <option value="">Selecione</option>
                    {['A','B','C','D','E','F'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Observação</label>
                <textarea className="form-textarea" value={form.observation} onChange={(e) => setForm((p) => ({ ...p, observation: e.target.value }))} placeholder="Ex: Foi difícil mas me esforcei!" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Nota</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
