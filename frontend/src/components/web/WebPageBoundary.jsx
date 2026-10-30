import { Component } from 'react';
import { useLocation } from 'react-router-dom';
import { recordWebEvent } from '../../services/webAdmin';
class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { recordWebEvent('render_error', this.props.route); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="web-billing"><div className="web-billing-card" role="alert"><h1>Não foi possível abrir esta página.</h1><p>Seus dados continuam salvos. Recarregue a página para tentar novamente.</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Recarregar</button></div></div>;
  }
}
export default function WebPageBoundary({ children }) {
  const { pathname } = useLocation();
  return <PageBoundary key={pathname} route={pathname.split('/')[1]}>{children}</PageBoundary>;
}
