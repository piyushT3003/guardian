import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import './styles/premium.css';
import App from './App.jsx';

const root = ReactDOM.createRoot(document.getElementById('root'));

if (import.meta.env.VITE_INPAGE) {
  // Self-contained build: the Guardian backend runs inside this page.
  const status = document.getElementById('boot-status');
  import('./inpage/backend.js')
    .then(({ bootBackend }) => bootBackend((m) => { if (status) status.textContent = m; }))
    .then(() => {
      document.getElementById('boot')?.remove();
      root.render(<React.StrictMode><MemoryRouter initialEntries={['/login']}><App /></MemoryRouter></React.StrictMode>);
    })
    .catch((e) => { console.error(e); if (status) status.textContent = `Guardian could not start: ${e.message}`; });
} else {
  root.render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
}
