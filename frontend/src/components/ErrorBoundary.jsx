import { Component, createContext, useContext } from 'react';

const ErrorContext = createContext({ report: (e) => {} });

export function useErrorBoundary() {
  return useContext(ErrorContext);
}

export class ErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error){ return { hasError: true, error }; }
  componentDidCatch(error, info){
    console.error('Caught by ErrorBoundary:', error, info);
    this.props.onError?.(error, info);
  }
  render(){
    if(this.state.hasError){
      return this.props.fallback ?? <div role="alert" style={{padding:12, border:'2px solid #fca5a5', background:'#fee2e2'}}>
        <strong>Etwas ist schiefgelaufen.</strong>
        <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error)}</pre>
        <button aria-label="Seite neu laden" onClick={()=>window.location.reload()}>Neu laden</button>
      </div>;
    }
    const value = { report: (e)=> this.setState({ hasError:true, error:e }) };
    return <ErrorContext.Provider value={value}>{this.props.children}</ErrorContext.Provider>;
  }
}
