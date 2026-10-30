import { queryMobileShell } from '../../hooks/useLayoutMode';
import ParentNavIcon from '../ui/ParentNavIcon';

export function ModuleIcon({ icon, nativeIcon, size = 24 }) {
  const isMobileShell = queryMobileShell();
  return isMobileShell ? nativeIcon : <ParentNavIcon name={icon} size={size}/>;
}
export default function ModuleTitle({ icon, nativeIcon, className = 'page-title', children }) {
  return <h1 className={className}><ModuleIcon icon={icon} nativeIcon={nativeIcon}/>{' '}{children}</h1>;
}
