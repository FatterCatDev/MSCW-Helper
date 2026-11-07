import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../common/base.css';
import './overlay.css';
import { OverlayApp } from './OverlayApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
);
