import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const TOUR_KEY = 'userTourDismissed';

const STEPS = [
  { id: 'new-portfolio', title: 'Create a Portfolio', text: 'Click New to create a portfolio before trading.' },
  { id: 'nav-trade', title: 'Trade (Buy / Sell)', text: 'Use the Trade tab to buy or sell securities.' },
  { id: 'nav-dashboard', title: 'Dashboard', text: 'Dashboard shows portfolio KPIs and quick actions.' },
  { id: 'nav-holdings', title: 'Current Holdings', text: 'View your current positions here.' },
  { id: 'nav-transactions', title: 'Transaction Ledger', text: 'See all buys, sells and cash events.' },
  { id: 'nav-what-if', title: 'What-If Simulator', text: 'Run hypothetical scenarios without changing real data.' },
  { id: 'nav-portfolios', title: 'Manage Portfolios', text: 'Manage or switch between your portfolios.' },
  { id: 'wallet', title: 'Wallet', text: 'Your tradeable cash. Ensure it has funds to buy.' },
  { id: 'brainrot', title: 'Brainrot Mode', text: 'Toggle playful Brainrot / Professional themes.' },
];

export function UserTour() {
  const { isDark } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(TOUR_KEY);
    if (!dismissed) {
      // small delay so DOM mounts and elements are available
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    // ensure current step's target exists; if not, advance until we find one
    const ensureTarget = () => {
      for (let i = stepIdx; i < STEPS.length; i++) {
        const sel = `[data-tour="${STEPS[i].id}"]`;
        if (document.querySelector(sel)) {
          if (i !== stepIdx) setStepIdx(i);
          return;
        }
      }
      // no targets found — end tour
      handleSkip();
    };
    ensureTarget();
    // also re-run if DOM changes a bit
    const obs = new MutationObserver(() => ensureTarget());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [visible, stepIdx]);

  if (!visible) return null;

  const step = STEPS[stepIdx];
  if (!step) return null;

  const target = document.querySelector(`[data-tour="${step.id}"]`);
  const rect = target ? target.getBoundingClientRect() : null;

  const handleNext = () => {
    if (stepIdx + 1 >= STEPS.length) {
      localStorage.setItem(TOUR_KEY, '1');
      setVisible(false);
      return;
    }
    setStepIdx((s) => s + 1);
  };

  const handleSkip = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setVisible(false);
  };

  // compute tooltip position; flip to left if it would overflow the viewport
  const TOOLTIP_W = 300;
  const tooltipStyle = rect
    ? (() => {
        const margin = 12;
        const preferredLeft = rect.left + window.scrollX + rect.width + margin;
        const preferredRight = preferredLeft + TOOLTIP_W;
        const viewportRight = window.innerWidth - 20; // small padding
        let left;
        if (preferredRight > viewportRight) {
          // place to the left of the element
          left = rect.left + window.scrollX - TOOLTIP_W - margin;
          if (left < 8) left = 8; // don't go off the very left edge
        } else {
          left = preferredLeft;
        }

        // ensure tooltip doesn't go off the top/bottom
        let top = rect.top + window.scrollY;
        const maxTop = window.innerHeight - 80;
        if (top > maxTop) top = Math.max(12, maxTop);

        return {
          position: 'fixed',
          left,
          top,
          zIndex: 1200,
          width: TOOLTIP_W,
        };
      })()
    : { position: 'fixed', left: 20, top: 80, zIndex: 1200, width: TOOLTIP_W };

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)',
    zIndex: 1000,
    pointerEvents: 'auto',
  };

  const highlightStyle = rect
    ? {
        position: 'fixed',
        left: rect.left + window.scrollX - 6,
        top: rect.top + window.scrollY - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        border: '3px solid #7c3aed', // violet border
        boxShadow: '0 8px 30px rgba(124,58,237,0.35)',
        borderRadius: 8,
        zIndex: 1100,
        background: 'transparent',
        pointerEvents: 'none',
      }
    : {};

  return (
    <>
      <div style={backdropStyle} onClick={handleSkip} />
      {rect && <div style={highlightStyle} aria-hidden="true" />}

      <div style={tooltipStyle}>
        <div
          style={{
            background: isDark ? '#0b1220' : '#ffffff',
            color: isDark ? '#f8fafc' : '#0f172a',
            border: `2px solid ${isDark ? '#7c3aed' : '#7c3aed'}`,
            padding: 14,
            borderRadius: 8,
            boxShadow: '0 6px 30px rgba(2,6,23,0.3)',
            fontSize: 14,
            zIndex: 1300,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{step.title}</div>
          <div style={{ marginBottom: 12 }}>{step.text}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleSkip}>
              Skip
            </button>
            <button className="btn btn-primary" onClick={handleNext}>
              {stepIdx + 1 >= STEPS.length ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default UserTour;
