import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'framer-motion';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <LazyMotion features={() => import('./motionFeatures.ts').then((mod) => mod.default)} strict>
          <App />
        </LazyMotion>
      </ErrorBoundary>
    </StrictMode>,
  );
}
