import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './app/providers/app-provider';
import { AppRouter } from './app/router/app-router';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <AppRouter />
    </AppProvider>
  </React.StrictMode>
);
