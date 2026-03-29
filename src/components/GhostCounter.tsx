"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'timeout';

interface GhostState {
  status: ConnectionStatus;
  count: number;
  showFallback: boolean;
}

export default function GhostCounter() {
  const [state, setState] = useState<GhostState>({
    status: 'connecting',
    count: 0,
    showFallback: false
  });
  
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Stable state updater to avoid dependency issues
  const updateState = useCallback((updates: Partial<GhostState>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('[GhostCounter] Missing Supabase env vars, showing fallback');
      updateState({ status: 'error', showFallback: true, count: 1 });
      return;
    }

    mountedRef.current = true;

    // Timeout fallback - if not connected in 5 seconds, show fallback
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && channelRef.current === null) {
        console.log('[GhostCounter] Connection timeout, showing fallback');
        updateState({ status: 'timeout', showFallback: true, count: 1 });
      }
    }, 5000);

    // Dynamically import Supabase (client-side only)
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!mountedRef.current) return;

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Create unique channel per tab
      const channelId = `global-presence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const channel = supabase.channel(channelId, {
        config: { presence: { key: channelId } }
      });

      channelRef.current = channel;
      console.log('[GhostCounter] Channel created:', channelId);

      // Helper to get count from presence state
      const getCount = () => {
        const presence = channel.presenceState();
        const keys = Object.keys(presence);
        // Fallback: if empty, at least show 1 (self)
        return keys.length === 0 ? 1 : keys.length;
      };

      // Set up presence listeners BEFORE subscribing
      channel.on("presence", { event: "sync" }, () => {
        if (!mountedRef.current) return;
        console.log('[GhostCounter] Presence sync');
        updateState({ count: getCount() });
      });

      channel.on("presence", { event: "join" }, () => {
        if (!mountedRef.current) return;
        console.log('[GhostCounter] User joined');
        updateState({ count: getCount() });
      });

      channel.on("presence", { event: "leave" }, () => {
        if (!mountedRef.current) return;
        console.log('[GhostCounter] User left');
        updateState({ count: getCount() });
      });

      // Subscribe with status callback
      channel.subscribe((status) => {
        if (!mountedRef.current) return;

        console.log('[GhostCounter] Channel status:', status);

        if (status === 'SUBSCRIBED') {
          // Clear timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          updateState({ status: 'connected', showFallback: false });
          
          // Track self immediately
          console.log('[GhostCounter] Tracking self...');
          channel.track({ online_at: Date.now(), key: channelId });
          
          // Get initial count
          updateState({ count: getCount() });
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          console.log('[GhostCounter] Channel error/closed');
          updateState({ status: 'error', showFallback: true, count: 1 });
        }
      });
    }).catch((err) => {
      console.error('[GhostCounter] Failed to load Supabase:', err);
      updateState({ status: 'error', showFallback: true, count: 1 });
    });

    // Cleanup
    return () => {
      mountedRef.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (channelRef.current) {
        console.log('[GhostCounter] Unsubscribing channel');
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [updateState]);

  // Determine display text based on state
  const getDisplayText = () => {
    switch (state.status) {
      case 'connecting':
        return { icon: '○', count: '--', label: 'CONNECTING' };
      case 'connected':
        return { icon: '⚡', count: state.count.toString(), label: 'GHOSTS' };
      case 'timeout':
      case 'error':
        return { icon: '⚡', count: state.count.toString(), label: 'GHOST MODE' };
      default:
        return { icon: '○', count: '--', label: 'GHOSTS' };
    }
  };

  const display = getDisplayText();

  return (
    <div className="ghost-counter">
      <span className="ghost-icon">{display.icon}</span>
      <span className="ghost-count">{display.count}</span>
      <span className="ghost-label">{display.label}</span>
      {state.status === 'connected' && <span className="ghost-pulse" />}
    </div>
  );
}
