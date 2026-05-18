import { useEffect, useState } from 'react';

/**
 * LocationAlertToast — mostra alerta animado de entrada/saída de zona segura.
 * Props: alerts = [{ id, type: 'enter'|'exit', userName, zoneName, zoneIcon }]
 */
export default function LocationAlertToast({ alerts = [], onDismiss }) {
  return (
    <div className="location-alert-container">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} onDismiss={() => onDismiss?.(alert.id)} />
      ))}
    </div>
  );
}

function AlertItem({ alert, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 400);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isEnter = alert.type === 'enter';
  const icon = alert.zoneIcon || (isEnter ? '📍' : '🚶');
  const verb = isEnter ? 'chegou em' : 'saiu de';
  const bgClass = isEnter ? 'location-alert-enter' : 'location-alert-exit';

  return (
    <div className={`location-alert-toast ${bgClass} ${visible ? 'show' : 'hide'}`}>
      <span className="location-alert-icon">{icon}</span>
      <div className="location-alert-text">
        <strong>{alert.userName}</strong> {verb} <strong>{alert.zoneName}</strong>
      </div>
    </div>
  );
}
