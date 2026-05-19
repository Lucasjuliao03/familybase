import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { supabase } from '../../lib/supabase';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { buildPeriodConfig, buildBoletim, scoreColor } from '../../lib/gradesHelpers';

const PREDEFINED_SUBJECTS = [
  'Matemática','Português','Ciências','História','Geografia',
  'Educação Física','Artes','Inglês','Espanhol','Física',
  'Química','Biologia','Filosofia','Sociologia','Música',
];

export default function MyGrades() {
  const { childProfile, ensureChildProfile, family } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();

  const [grades, setGrades] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState(0); // 0 = geral, senão número do período
  
  const [settings, setSettings] = useState({ evaluation_model: 'bimonthly', approval_pct: 60 });
  const [periods, setPeriods] = useState([]);
  
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

      const { data: sgpRows } = await supabase
        .from('school_grade_periods')
        .select('*')
        .eq('family_id', family.id)
        .eq('child_id', cid)
        .order('period_number', { ascending: true });
      if (sgpRows) setPeriods(sgpRows);
    }
  }, [childProfile?.id, family?.id]);

  useEffect(() => { loadBundle(); }, [loadBundle, location.pathname]);
  useAutoRefresh(loadBundle, 2600);

  const pConfig = buildPeriodConfig(settings, periods);
  const boletim = buildBoletim(grades, pConfig);

  const filteredPeriods = filterPeriod === 0 
    ? boletim.periods 
    : boletim.periods.filter(p => p.number === filterPeriod);

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
        <button className={`btn btn-sm ${filterPeriod === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(0)}>Geral (Ano)</button>
        {pConfig.map((p) => (
          <button key={p.number} className={`btn btn-sm ${filterPeriod === p.number ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(p.number)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Dashboard Geral (só aparece se filtro for 0) */}
      {filterPeriod === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          <div className="stat-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: 2 }}>Média Final</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: boletim.overall.passed ? 'var(--success)' : 'var(--text)' }}>
              {boletim.overall.weightedAvg.toFixed(1)}
            </div>
          </div>
          <div className="stat-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginBottom: 2 }}>Pontos Acumulados</div>
            <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{boletim.overall.totalObtained.toFixed(1)}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>de {boletim.overall.totalMax}</div>
          </div>
          {boletim.overall.missing > 0 && (
            <div className="stat-card" style={{ padding: '12px 14px', borderColor: '#F97316', background: 'rgba(249,115,22,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: '#F97316', marginBottom: 2 }}>Faltam na Média</div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#F97316' }}>{boletim.overall.missing.toFixed(1)}</div>
            </div>
          )}
          {boletim.overall.passed && (
            <div className="stat-card" style={{ padding: '12px 14px', borderColor: 'var(--success)', background: 'rgba(34,197,94,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--success)', marginBottom: 2 }}>Situação</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--success)', marginTop: 4 }}>Aprovado 🎉</div>
            </div>
          )}
        </div>
      )}

      {/* Boletim por Período */}
      {filteredPeriods.map((p) => (
        <div key={p.number} className="card mb-16" style={{ padding: '16px' }}>
          <div className="flex-between mb-12" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.label}</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 2 }}>
                Meta de aprovação: {p.min_score}pts ({p.approval_pct}%)
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: scoreColor(p.obtained, p.total_points, p.approval_pct) }}>
                {p.obtained.toFixed(1)} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {p.total_points}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: p.passed ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                {p.passed ? 'Na meta' : 'Abaixo da meta'}
              </div>
            </div>
          </div>

          {Object.keys(p.subjects).length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Sem notas neste período.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {Object.entries(p.subjects).map(([subj, data]) => (
                <div key={subj} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                  <div className="flex-between mb-8">
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{subj}</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>
                      {data.total.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>/{data.max}</span>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 6 }}>
                    {data.grades.map(g => (
                      <div key={g.id} style={{ background: 'var(--bg-card)', padding: '6px', borderRadius: 4, textAlign: 'center', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-light)', marginBottom: 2 }}>{typeLabels[g.type] || g.type}</div>
                        {g.score != null ? (
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: scoreColor(g.score, g.max_score, 60) }}>
                            {g.score}<span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)' }}>/{g.max_score}</span>
                          </div>
                        ) : (
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{g.concept || '-'}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

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
                    {pConfig.map((p) => <option key={p.number} value={p.number}>{p.label}</option>)}
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
