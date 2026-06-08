import type { ReactNode } from 'react';
import { Logo } from '../Logo';

// The persistent app top bar. The threadwick brand stays fixed in the top-left
// on every page; each view passes its own controls as children, which render
// after the brand. Keeping this in one place means the logo never moves or
// disappears as you navigate between Projects, a Project, and the Editor.
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo className="brand-mark" size={22} />
        <span className="brand-name">threadwick <span className="brand-sub">studio</span></span>
      </div>
      {children}
    </header>
  );
}
