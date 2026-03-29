"use client";

import { useState, useEffect, useRef } from "react";

type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'timeout';

// Global channel name - MUST be same across all tabs for sync
const GLOBAL_CHANNEL = '0null-global-presence';

interface GhostState {
  status: ConnectionStatus;
  count: number;
}

export default function GhostCounter() {
  const [state, setState] = useState<GhostState>({
    status: 'connecting',
    count: 0
  });
  
  const channelRef = useRef<{ unsubscribe: () => void; track: (state: object) => void } | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('[GHOST] Missing Supabase env vars');
      setState({ status: 'error', count: 1 });
      return;
    }

    mountedRef.current = true;
    console.log('[GHOST] Starting...');

    // 15 second timeout before fallback
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && !channelRef.current) {
        console.log('[GHOST] Connection timeout after 15s, showing fallback');
        setState({ status: 'timeout', count: 1 });
      }
    }, 15000);

    // Dynamically import Supabase
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!mountedRef.current) return;

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Create channel with FIXED global name for cross-tab sync
      const channel = supabase.channel(GLOBAL_CHANNEL, {
        config: { presence: { key: `ghost-${Math.random().toString(36).substr(2, 9)}` } }
      });

      channelRef.current = channel;
      console.log('[GHOST] Channel created:', GLOBAL_CHANNEL);

      // Helper to get count
      const getCount = () => {
        const presence = channel.presenceState();
        const keys = Object.keys(presence);
        console.log('[GHOST] Presence State:', JSON.stringify(presence));
        console.log('[GHOST] Key count:', keys.length);
        return keys.length === 0 ? 1 : keys.length;
      };

      // Subscribe FIRST, then attach listeners
      // This ensures we don't miss the initial sync
      channel.subscribe((status) => {
        if (!mountedRef.current) return;

        console.log('[GHOST] Channel status:', status);

        if (status === 'SUBSCRIBED') {
          console.log('[GHOST] Connected! Clearing timeout...');
          
          // Clear the connection timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          // Track self immediately
          console.log('[GHOST] Tracking self...');
          channel.track({ online_at: Date.now() });

          // Start heartbeat every 30 seconds to keep connection warm
          heartbeatRef.current = setInterval(() => {
            if (channelRef.current && mountedRef.current) {
              console.log('[GHOST] Heartbeat ping...');
              channelRef.current.track({ online_at: Date.now() });
            }
          }, 30000);

          // Get initial count
          setState({ status: 'connected', count: getCount() });

        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('[GHOST] Channel closed/error');
          setState({ status: 'error', count: 1 });
          
          if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
          }
        }
      });

      // Now attach presence listeners AFTER subscribe
      channel.on("presence", { event: "sync" }, () => {
        if (!mountedRef.current) return;
        console.log('[GHOST] Presence sync received');
        setState(prev => ({ ...prev, count: getCount() }));
      });

      channel.on("presence", { event: "join" }, (payload) => {
        if (!mountedRef.current) return;
        console.log('[GHOST] User joined:', payload);
        setState(prev => ({ ...prev, count: getCount() }));
      });

      channel.on("presence", { event: "leave" }, (payload) => {
        if (!mountedRef.current) return;
        console.log('[GHOST] User left:', payload);
        setState(prev => ({ ...prev, count: getCount() }));
      });

    }).catch((err) => {
      console.error('[GHOST] Failed to load Supabase:', err);
      setState({ status: 'error', count: 1 });
    });

    // Cleanup
    return () => {
      mountedRef.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      
      if (channelRef.current) {
        console.log('[GHOST] Unsubscribing...');
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, []);

  // Display logic
  const getDisplay = () => {
    if (state.status === 'connecting') {
      return { icon: '○', count: '--', label: 'CONNECTING' };
    }
    if (state.status === 'connected') {
      return { icon: '⚡', count: state.count.toString(), label: 'GHOSTS' };
    }
    // error or timeout
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
