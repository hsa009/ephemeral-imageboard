"use client";

import { useState, useEffect, useRef } from "react";

type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'timeout';

const GLOBAL_CHANNEL = '0null-global-presence';

interface GhostCounterProps {
  onCountChange?: (newCount: number, prevCount: number) => void;
}

interface GhostState {
  status: ConnectionStatus;
  count: number;
}

export default function GhostCounter({ onCountChange }: GhostCounterProps) {
  const [state, setState] = useState<GhostState>({
    status: 'connecting',
    count: 0
  });
  
  const channelRef = useRef<{ unsubscribe: () => void; track: (state: object) => void } | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setState({ status: 'error', count: 1 });
      return;
    }

    mountedRef.current = true;

    // 15 second timeout
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && !channelRef.current) {
        setState({ status: 'timeout', count: 1 });
      }
    }, 15000);

    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!mountedRef.current) return;

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      const channel = supabase.channel(GLOBAL_CHANNEL, {
        config: { presence: { key: `ghost-${Math.random().toString(36).substr(2, 9)}` } }
      });

      channelRef.current = channel;

      const getCount = () => {
        const presence = channel.presenceState();
        const keys = Object.keys(presence);
        return keys.length === 0 ? 1 : keys.length;
      };

      channel.subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          channel.track({ online_at: Date.now() });

          heartbeatRef.current = setInterval(() => {
            if (channelRef.current && mountedRef.current) {
              channelRef.current.track({ online_at: Date.now() });
            }
          }, 30000);

          const newCount = getCount();
          setState({ status: 'connected', count: newCount });

          // Notify parent of initial count (don't play sound)
          onCountChange?.(newCount, prevCountRef.current);

        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setState({ status: 'error', count: 1 });
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
          }
        }
      });

      channel.on("presence", { event: "sync" }, () => {
        if (!mountedRef.current) return;
        const prevCount = prevCountRef.current;
        const newCount = getCount();
        prevCountRef.current = newCount;
        setState(prev => ({ ...prev, count: newCount }));
        onCountChange?.(newCount, prevCount);
      });

      channel.on("presence", { event: "join" }, () => {
        if (!mountedRef.current) return;
        const prevCount = prevCountRef.current;
        const newCount = getCount();
        prevCountRef.current = newCount;
        setState(prev => ({ ...prev, count: newCount }));
        onCountChange?.(newCount, prevCount);
      });

      channel.on("presence", { event: "leave" }, () => {
        if (!mountedRef.current) return;
        const newCount = getCount();
        prevCountRef.current = newCount;
        setState(prev => ({ ...prev, count: newCount }));
      });

    }).catch((err) => {
      setState({ status: 'error', count: 1 });
    });

    return () => {
      mountedRef.current = false;
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [onCountChange]);

  const getDisplay = () => {
    if (state.status === 'connecting') {
      return { icon: '○', count: '--', label: 'CONNECTING' };
    }
    if (state.status === 'connected') {
      return { icon: '⚡', count: state.count.toString(), label: 'GHOSTS' };
    }
    return { icon: '⚡', count: state.count.toString(), label: 'GHOST MODE' };
  };

  const display = getDisplay();

  return (
    <div className="ghost-counter">
      <span className="ghost-icon">{display.icon}</span>
      <span className="ghost-count">{display.count}</span>
      <span className="ghost-label">{display.label}</span>
      {state.status === 'connected' && <span className="ghost-pulse" />}
    </div>
  );
}
