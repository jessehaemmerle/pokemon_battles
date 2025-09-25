import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

if (import.meta.env.DEV) {
  // Safety check: eine React-Kopie?
  // Öffne Konsole: sollte genau 1 Version sein.
  // (Nur Debug; im Build automatisch entfernt)
  console.log('[react-version]', React.version);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
