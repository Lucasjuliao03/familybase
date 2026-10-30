import { Component } from 'react';
export default class AppBootBoundary extends Component {
  state = { failed:false };
  static getDerivedStateFromError() { return { failed:true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="web-boot"><div style={{padding:32,maxWidth:480,textAlign:'center'}}><h1>Não foi possível carregar seu espaço.</h1><p>Confira a conexão e recarregue a página. Seus dados permanecem salvos.</p><button onClick={()=>window.location.reload()} style={{marginTop:20,padding:'12px 20px',border:0,borderRadius:10,background:'#007b83',color:'#fff',cursor:'pointer'}}>Recarregar página</button></div></div>;
  }
}
