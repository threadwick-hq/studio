import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Logo } from '../Logo';
import { cloudEnabled } from '../cloud/config';

// Loaded lazily, and only when cloud is configured, so a build with no Supabase
// env vars ships and fetches zero cloud code.
const AuthMenu = lazy(() => import('../cloud/AuthMenu').then((m) => ({ default: m.AuthMenu })));

// The persistent app top bar. The threadwick brand stays fixed in the top-left
// on every page; each view passes its own controls as children, which render
// after the brand. Keeping this in one place means the logo never moves or
// disappears as you navigate between Projects, a Project, and the Editor.
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo className="brand-mark" size={34} />
        <span className="brand-lockup">
          <span className="brand-name">threadwick</span>
          <span className="brand-sub">studio</span>
        </span>
      </div>
      {children}
      {cloudEnabled && <Suspense fallback={null}><AuthMenu /></Suspense>}
    </header>
  );
}
