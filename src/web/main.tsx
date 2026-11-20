import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import { About } from './pages/About.tsx';
import { Home } from './pages/Home.tsx';
import { Import } from './pages/Import.tsx';
import { Result } from './pages/Result.tsx';
import { Story } from './pages/Story.tsx';
import './styles.css';

function NotFound() {
  return (
    <main className="page">
      <h1>Not found</h1>
      <p>
        <a href="/">Back to start</a>
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/import" component={Import} />
      <Route path="/about" component={About} />
      <Route path="/r/:id/story">{(p) => <Story id={p.id} />}</Route>
      <Route path="/r/:id">{(p) => <Result id={p.id} />}</Route>
      <Route component={NotFound} />
    </Switch>
    <footer className="site-foot">
      <a href="/about">About</a> · not affiliated with Last.fm
    </footer>
  </StrictMode>,
);
