import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro em runtime:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-white">
          <div className="max-w-md w-full bg-surface border border-accent-amber/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-accent-amber flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold font-serif">
              {this.props.fallbackTitle || 'Ops, algo inesperado ocorreu'}
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              O sistema encontrou uma falha na renderização de dados. Clique abaixo para atualizar a aplicação com segurança.
            </p>
            {this.state.error && (
              <div className="p-3 bg-black/40 rounded-lg text-left text-[11px] font-mono text-red-300 overflow-x-auto max-h-28">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 bg-accent-amber text-background font-bold text-xs rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
