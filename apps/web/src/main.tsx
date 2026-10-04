import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createApiClient } from './api/client.js';
import { apiBaseUrl } from './config.js';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Cannot start PulseBoard: index.html is missing the #root container');
}

const client = createApiClient({ baseUrl: apiBaseUrl });

createRoot(container).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);