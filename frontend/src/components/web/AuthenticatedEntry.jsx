import { lazy, Suspense } from 'react';
import AppBootBoundary from './AppBootBoundary';
const AuthenticatedApp = lazy(() => import('../../App'));
export default function AuthenticatedEntry() {
  return <AppBootBoundary><Suspense fallback={<div role="status" className="web-boot">Preparando seu espaço…</div>}><AuthenticatedApp /></Suspense></AppBootBoundary>;
}
