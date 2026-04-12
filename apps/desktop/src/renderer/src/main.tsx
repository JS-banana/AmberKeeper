import React from 'react';
import ReactDOM from 'react-dom/client';
import { TooltipProvider } from './components/ui/tooltip';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
