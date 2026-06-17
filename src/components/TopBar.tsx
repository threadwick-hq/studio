import { Suspense, createContext, lazy, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { StudioLogo } from '@threadwick/core/brand';
import { cloudEnabled } from '../cloud/config';

// Loaded lazily, and only when cloud is configured, so a build with no Supabase
// env vars ships and fetches zero cloud code.
const AuthMenu = lazy(() => import('../cloud/AuthMenu').then((m) => ({ default: m.AuthMenu })));

const SlotContext = createContext<HTMLElement | null>(null);

// The persistent app top bar: mounted ONCE in App and never remounted on
// navigation, so the brand and the header itself stay rock-steady. Each view
// contributes its own controls through <TopBarSlot>, which portals them into
// the bar — swapping views swaps only the slot's children (targeted updates).
export function TopBar({ children }: { children?: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <SlotContext.Provider value={slot}>
      <header className="topbar">
        <div className="brand">
          <StudioLogo size={34} />
          <span className="brand-lockup">
            <span className="brand-name">threadwick</span>
            <span className="brand-sub">studio</span>
          </span>
        </div>
        <div className="topbar-slot" ref={setSlot} />
        {cloudEnabled && <Suspense fallback={null}><AuthMenu /></Suspense>}
      </header>
      {children}
    </SlotContext.Provider>
  );
}

// Render the current view's header controls into the persistent top bar.
export function TopBarSlot({ children }: { children?: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}
