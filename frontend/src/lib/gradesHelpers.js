/**
 * gradesHelpers.js — Lógica de cálculo de boletim escolar (Por Matéria)
 * Funções puras — sem chamadas à API, sem side-effects.
 */

export const DEFAULT_PERIOD_LABELS = {
  bimonthly: ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'],
  trimester:  ['1º Trimestre', '2º Trimestre', '3º Trimestre'],
};

export const DEFAULT_PERIOD_POINTS = {
  bimonthly: 25,
  trimester:  33.33,
};

export function buildPeriodConfig(settings, periods = []) {
  const model = settings?.evaluation_model ?? 'bimonthly';
  const count = model === 'trimester' ? 3 : 4;
  const defaultPts = DEFAULT_PERIOD_POINTS[model];
  const defaultPct = settings?.approval_pct ?? 60;
  const labels = DEFAULT_PERIOD_LABELS[model];

  return Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    const saved = periods.find((p) => p.period_number === num);
    const totalPts = saved?.total_points ?? defaultPts;
    const approvPct = saved?.approval_pct ?? defaultPct;
    return {
      number: num,
      label: saved?.period_label || labels[i] || `Período ${num}`,
      total_points: totalPts,
      approval_pct: approvPct,
      weight: saved?.weight ?? 1,
      min_score: (totalPts * approvPct) / 100,
    };
  });
}

/**
 * Agrupa notas por matéria e depois por período.
 */
export function buildSubjectBoletim(grades, periodCfg, settings) {
  const annualTotal = settings?.annual_total_points ?? 100;
  const approvalPct = settings?.approval_pct ?? 60;
  const goalPct = settings?.goal_pct ?? 80;
  const attentionPct = settings?.attention_pct ?? 50;
  const riskPct = settings?.risk_pct ?? 75;

  const minRequiredAnnual = (annualTotal * approvalPct) / 100;
  const goalRequiredAnnual = (annualTotal * goalPct) / 100;

  // Agrupar todas as notas por matéria
  const bySubject = {};
  grades.forEach(g => {
    if (!bySubject[g.subject]) {
      bySubject[g.subject] = { grades: [], teacher: g.teacher_name || '' };
    }
    bySubject[g.subject].grades.push(g);
    if (g.teacher_name && !bySubject[g.subject].teacher) {
      bySubject[g.subject].teacher = g.teacher_name;
    }
  });

  const subjects = Object.entries(bySubject).map(([name, data]) => {
    const subjectGrades = data.grades;
    let obtainedAnnual = 0;
    let maxEvaluatedAnnual = 0;

    // Construir os períodos para esta matéria
    const periods = periodCfg.map(cfg => {
      const pGrades = subjectGrades.filter(g => g.period_number === cfg.number);
      const scoredGrades = pGrades.filter(g => g.score != null);
      
      const obtained = scoredGrades.reduce((s, g) => s + g.score, 0);
      const maxEvaluated = scoredGrades.reduce((s, g) => s + (g.max_score || 0), 0);
      
      obtainedAnnual += obtained;
      maxEvaluatedAnnual += maxEvaluated;

      return {
        number: cfg.number,
        label: cfg.label,
        totalPoints: cfg.total_points,
        minScore: cfg.min_score,
        obtained,
        maxEvaluated,
        pct: maxEvaluated > 0 ? (obtained / maxEvaluated) * 100 : 0,
        passed: obtained >= cfg.min_score,
        hasData: scoredGrades.length > 0,
        grades: pGrades
      };
    });

    const missing = Math.max(0, minRequiredAnnual - obtainedAnnual);
    const missingGoal = Math.max(0, goalRequiredAnnual - obtainedAnnual);
    const remainingAnnualPoints = Math.max(0, annualTotal - maxEvaluatedAnnual);
    
    let requiredRate = 0;
    if (missing > 0) {
      requiredRate = remainingAnnualPoints > 0 ? (missing / remainingAnnualPoints) * 100 : Infinity;
    }

    let status = 'nodata';
    let statusLabel = 'Sem Notas';
    
    if (maxEvaluatedAnnual > 0) {
      if (obtainedAnnual >= minRequiredAnnual) {
        status = 'approved';
        statusLabel = 'Aprovado 🎉';
      } else if (requiredRate > 100 || (missing > remainingAnnualPoints)) {
        status = 'failed';
        statusLabel = 'Reprovado ❌';
      } else if (requiredRate > riskPct) {
        status = 'risk';
        statusLabel = 'Em Risco ⚠️';
      } else if (requiredRate >= attentionPct) {
        status = 'attention';
        statusLabel = 'Atenção 🟡';
      } else {
        status = 'comfortable';
        statusLabel = 'Confortável 🟢';
      }
    }

    const currentAvg = maxEvaluatedAnnual > 0 ? (obtainedAnnual / maxEvaluatedAnnual) * 10 : null;
    const goalReached = obtainedAnnual >= goalRequiredAnnual;

    return {
      name,
      teacher: data.teacher,
      obtained: obtainedAnnual,
      maxEvaluated: maxEvaluatedAnnual,
      annualTotal,
      minRequiredAnnual,
      goalRequiredAnnual,
      missing,
      missingGoal,
      remainingAnnualPoints,
      requiredRate,
      status,
      statusLabel,
      currentAvg,
      goalReached,
      periods
    };
  });

  // Calcular métricas gerais
  let sumAvg = 0;
  let countAvg = 0;
  let subjectsApproved = 0;
  let subjectsAttention = 0;
  let subjectsRisk = 0;
  let subjectsFailed = 0;
  let subjectsGoalReached = 0;

  subjects.forEach(s => {
    if (s.currentAvg !== null) {
      sumAvg += s.currentAvg;
      countAvg++;
    }
    if (s.status === 'approved' || s.status === 'comfortable') subjectsApproved++;
    else if (s.status === 'attention') subjectsAttention++;
    else if (s.status === 'risk') subjectsRisk++;
    else if (s.status === 'failed') subjectsFailed++;
    
    if (s.goalReached) subjectsGoalReached++;
  });

  const overallAvg = countAvg > 0 ? sumAvg / countAvg : null;

  return {
    subjects,
    overall: {
      avg: overallAvg,
      approved: subjectsApproved,
      attention: subjectsAttention,
      risk: subjectsRisk,
      failed: subjectsFailed,
      goalReached: subjectsGoalReached,
      totalSubjects: subjects.length
    }
  };
}

export function scoreColorByStatus(status) {
  switch (status) {
    case 'approved':
    case 'comfortable': return 'var(--success)';
    case 'attention': return '#F59E0B'; // amber-500
    case 'risk':
    case 'failed': return 'var(--danger)';
    default: return 'var(--text-muted)';
  }
}

export function statusBadgeStyle(status) {
  const base = { padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-block' };
  switch (status) {
    case 'approved':
    case 'comfortable': return { ...base, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' };
    case 'attention': return { ...base, background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' };
    case 'risk':
    case 'failed': return { ...base, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' };
    default: return { ...base, background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' };
  }
}

