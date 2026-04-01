"use client";

import { useState, useEffect, useRef } from "react";

interface PulseThread {
  id: number;
  subject: string;
  niche: string;
  heat_score: number;
  heat_normalized: number;
  recent_replies: number;
  total_reactions: number;
}

interface PulseSidebarProps {
  onSelectThread: (threadId: number) => void;
}

export default function PulseSidebar({ onSelectThread }: PulseSidebarProps) {
  const [pulse, setPulse] = useState<PulseThread[]>([]);
  const [glitch, setGlitch] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/pulse');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.success && data.pulse) {
            setPulse(data.pulse);
            setGlitch(true);
            setTimeout(() => { if (!cancelled) setGlitch(false); }, 300);
          }
        }
      } catch (e) {
        console.error("[PULSE] Fetch error:", e);
      }
    };

    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleClick = (threadId: number) => {
    onSelectThread(threadId);
    setDrawerOpen(false);
  };

  const content = (
    <>
      <div className="pulse-header">
        [ SYSTEM_PULSE: MONITORING ]
      </div>
      {pulse.length === 0 ? (
        <div className="pulse-empty">waiting for signal...</div>
      ) : (
        pulse.map((thread) => (
          <div
            key={thread.id}
            className="pulse-item"
            onClick={() => handleClick(thread.id)}
          >
            <div className="pulse-item-header">
              <span className="pulse-dot" />
              <span className="pulse-subject">{thread.subject}</span>
            </div>
            <div className="pulse-heat-bar">
              <div
                className="pulse-heat-fill"
                style={{ width: `${thread.heat_normalized}%` }}
              />
            </div>
            <div className="pulse-meta">
              <span>{thread.recent_replies} replies</span>
              <span>•</span>
              <span>{thread.niche}</span>
            </div>
          </div>
        ))
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`pulse-sidebar ${glitch ? 'pulse-glitch' : ''}`}>
        {content}
      </div>

      {/* Mobile trigger + drawer */}
      <button
        className="pulse-mobile-trigger"
        onClick={() => setDrawerOpen(!drawerOpen)}
        title="System Pulse"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      </button>

      {drawerOpen && (
        <>
          <div className="pulse-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className={`pulse-drawer ${glitch ? 'pulse-glitch' : ''}`}>
            <div className="pulse-drawer-header">
              <span>[ SYSTEM_PULSE ]</span>
              <button onClick={() => setDrawerOpen(false)} className="pulse-drawer-close">✕</button>
            </div>
            {content}
          </div>
        </>
      )}
    </>
  );
}
