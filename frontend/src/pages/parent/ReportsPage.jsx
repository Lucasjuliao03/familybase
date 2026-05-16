import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';

export default function ReportsPage() {
  const { t } = useLanguage();
  const location = useLocation();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [report, setReport] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const blocking = listLoading || (Boolean(selectedChild) && reportLoading);

  /** Lista de dependentes sempre que volta à rota `/parent/reports`. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setError('');
      try {
        const kidsRes = await api.get('/families/children');
        const kidRows = Array.isArray(kidsRes?.data) ? kidsRes.data : [];
        if (cancelled) return;
        setChildren(kidRows);
        setSelectedChild((prev) => {
          const stillOk = kidRows.some((k) => k.id === prev);
          if (stillOk) return prev;
          return kidRows[0]?.id || '';
        });
      } catch (_) {
        if (!cancelled) {
          setError(t('error_occurred') || 'Erro ao carregar relatórios');
          setChildren([]);
          setSelectedChild('');
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, t, reloadTick]);

  /** Detalhes do relatório sempre que mudar o filho selecionado. */
  useEffect(() => {
    if (!selectedChild) {
      setReport(null);
      setReportLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      setError('');
      try {
        const repRes = await api.get(`/reports/child/${selectedChild}`);
        if (!cancelled) setReport(repRes.data || null);
      } catch (_) {
        if (!cancelled) {
          setError(t('error_occurred') || 'Erro ao carregar relatório');
          setReport(null);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChild, t]);

  const reloadFromVisibility = useCallback(async () => {
    if (!selectedChild) return;
    try {
      const repRes = await api.get(`/reports/child/${selectedChild}`);
      setReport(repRes.data || null);
    } catch {
      /* manter relatório último válido para não flicker fantasma em rede instável */
    }
  }, [selectedChild]);

  useAutoRefresh(reloadFromVisibility, 2600, { includeRouteChanges: false });

  if (blocking && !report) {
    return (
      <div className="flex-center" style={{ padding: 60, flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: '2rem' }}>⏳</span>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('loading') || 'A carregar…'}</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="flex-center" style={{ padding: 60, flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setReloadTick((n) => n + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const exportCSV = async (type) => {
    try {
      const { data } = await api.get(`/reports/export/${type}`, { params: { child_id: selectedChild } });
      if (!data.length) return;
      const headers = Object.keys(data[0]);
      const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${type}_report.csv`; a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div><h1 className="page-title">📈 {t('reports')}</h1></div>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('tasks')}>📊 {t('tasks')} CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('grades')}>📚 {t('grades')} CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('history')}>📋 History CSV</button>
        </div>
      </div>

      <div className="flex gap-12 mb-24">
        {children.map(c => (
          <button key={c.id} className={`btn ${selectedChild === c.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedChild(c.id)}
            style={selectedChild === c.id ? {} : {borderLeft:`3px solid ${c.color}`}}>{c.name}</button>
        ))}
      </div>

      <div className="grid grid-4 mb-24">
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(0,184,148,0.1)'}}>✅</div><div className="stat-info"><h3>{report.taskStats.approved}</h3><p>{t('approved')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(253,203,110,0.15)'}}>⏳</div><div className="stat-info"><h3>{report.taskStats.pending}</h3><p>{t('pending')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(108,92,231,0.1)'}}>⭐</div><div className="stat-info"><h3>{report.child.points}</h3><p>{t('total_points')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(232,67,147,0.1)'}}>🏅</div><div className="stat-info"><h3>{report.medals.length}</h3><p>{t('medals')}</p></div></div>
      </div>

      <div className="grid grid-2 mb-24">
        <div className="card">
          <h3 className="card-title mb-16">📚 {t('grades')} - {t('average')}</h3>
          {Object.keys(report.avgBySubject).length === 0 ? <p style={{color:'var(--text-light)'}}>{t('no_grades')}</p> :
            Object.entries(report.avgBySubject).map(([subj, avg]) => (
              <div key={subj} className="flex-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontWeight:600}}>{subj}</span>
                <span style={{fontWeight:700,color: avg >= 7 ? 'var(--success)' : avg >= 5 ? '#E67E22' : 'var(--danger)'}}>{avg}</span>
              </div>
            ))}
        </div>
        <div className="card">
          <h3 className="card-title mb-16">🏅 {t('medals')}</h3>
          <div className="flex gap-8" style={{flexWrap:'wrap'}}>
            {report.medals.length === 0 ? <p style={{color:'var(--text-light)'}}>Nenhuma medalha</p> :
              report.medals.map(m => (
                <div key={m.id} className="medal-card earned" style={{minWidth:80}}>
                  <div className="medal-icon">{m.icon}</div>
                  <div className="medal-name">{m.name}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title mb-16">📋 {t('recent_activity')}</h3>
        {report.history && report.history.length > 0
          ? report.history.map((h) => (
          <div key={h.id} className="flex-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:'0.88rem'}}>{h.event}</span>
            <div className="flex gap-8">{h.points !== 0 && <span className={`badge ${h.points > 0 ? 'badge-success' : 'badge-danger'}`}>{h.points > 0 ? '+' : ''}{h.points}</span>}
              <span style={{fontSize:'0.75rem',color:'var(--text-light)'}}>{new Date(h.created_at).toLocaleDateString('pt-BR')}</span></div>
          </div>
          ))
          : <p style={{color:'var(--text-light)'}}>{t('no_activity') || 'Sem actividade registada.'}</p>}
      </div>
    </div>
  );
}
