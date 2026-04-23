import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    __GPUMON_CONFIG__?: {
      fontFamily?: string;
      fontCssUrl?: string;
      wsUrl?: string;
    };
  }
}

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GPU Monitor failed to render', error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="crash-shell">
        <div className="crash-card">
          <div className="crash-prelude">Render failure</div>
          <h1>GPU Monitor could not render the dashboard.</h1>
          <p>
            The page hit a runtime error before React finished mounting. Reload after rebuilding,
            or inspect the browser console if this persists.
          </p>
          <pre className="crash-stack">{this.state.error.stack || this.state.error.message}</pre>
        </div>
      </div>
    );
  }
}

const configuredFont = window.__GPUMON_CONFIG__?.fontFamily?.trim();
const configuredFontCss = window.__GPUMON_CONFIG__?.fontCssUrl;

if (configuredFontCss) {
  const existingFontLink = document.querySelector<HTMLLinkElement>(
    `link[rel="stylesheet"][href="${configuredFontCss}"]`,
  );
  if (!existingFontLink) {
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = configuredFontCss;
    document.head.appendChild(fontLink);
  }
}

if (configuredFont) {
  document.documentElement.style.setProperty(
    '--font-ui',
    `"${configuredFont}", -apple-system, BlinkMacSystemFont, sans-serif`,
  );
  document.documentElement.style.setProperty(
    '--font-mono',
    `"${configuredFont}", "IBM Plex Mono", "SFMono-Regular", "Fira Code", Consolas, monospace`,
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)
