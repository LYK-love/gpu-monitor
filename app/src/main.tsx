import { StrictMode } from 'react'
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

const configuredFont = window.__GPUMON_CONFIG__?.fontFamily || 'Fira Code';
const configuredFontCss = window.__GPUMON_CONFIG__?.fontCssUrl;

if (configuredFontCss) {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = configuredFontCss;
  document.head.appendChild(fontLink);
}

document.documentElement.style.setProperty(
  '--app-font',
  `"${configuredFont}", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
);
document.documentElement.style.setProperty(
  '--mono-font',
  `"${configuredFont}", "Fira Code", "JetBrains Mono", "SFMono-Regular", "Cascadia Code", "Liberation Mono", Consolas, monospace`,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
