import ParentNavIcon from '../ui/ParentNavIcon';

export function WebMetric({ label, value, icon, note }) {
  return <article className="workspace-metric"><div><span>{label}</span><strong>{value ?? '—'}</strong>{note && <small>{note}</small>}</div><span className="workspace-metric-icon"><ParentNavIcon name={icon} size={20}/></span></article>;
}
export function WebEmptyState({ icon = 'clipboard', title, description }) {
  return <div className="workspace-empty"><ParentNavIcon name={icon} size={24}/><h3>{title}</h3>{description && <p>{description}</p>}</div>;
}
export function WebPanel({ title, icon, action, children, className = '' }) {
  return <section className={`workspace-panel ${className}`}><header><h2>{icon && <ParentNavIcon name={icon} size={18}/>} {title}</h2>{action}</header>{children}</section>;
}
