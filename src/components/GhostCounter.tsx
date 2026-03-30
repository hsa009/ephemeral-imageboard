"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface GhostCounterProps {
  onCountChange?: (newCount: number, prevCount: number) => void;
}

interface GhostState {
  status: 'connecting' | 'connected' | 'error';
  count: number;
}

const HEARTBEAT_INTERVAL = 60000; // 60 seconds
const STALE_THRESHOLD = 180000; // 3 minutes in ms
const GHOST_ID_KEY = "0null_ghost_id";

export default function GhostCounter({ onCountChange }: GhostCounterProps) {
  const [state, setState] = useState<GhostState>({ status: 'connecting', count: 0 });
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const prevCountRef = useRef(0);

  const getGhostId = () => {
    let id = localStorage.getItem(GHOST_ID_KEY);
    if (!id) {
      id = `ghost-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(GHOST_ID_KEY, id);
    }
    return id;
  };

  const updatePresence = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) return null;
    
    const ghostId = getGhostId();
    
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Upsert presence row
      await supabase.from("presence").upsert({
        ghost_id: ghostId,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'ghost_id'
      });
      
      return supabase;
    } catch (e) {
      console.error("[GHOST] Failed to update presence:", e);
      return null;
    }
  }, []);

  const fetchGhostCount = useCallback(async (supabase: any) => {
    if (!mountedRef.current) return 0;
    
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD).toISOString();
      const { count, error } = await supabase
        .from("presence")
        .select("*", { count: "exact", head: true })
        .gte("last_seen_at", cutoff);
      
      if (error) throw error;
      return count || 0;
    } catch (e) {
      console.error("[GHOST] Count fetch error:", e);
      return 1;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    mountedRef.current = true;

    const init = async () => {
      const supabase = await updatePresence();
      if (!mountedRef.current) return;
      
      if (!supabase) {
        setState({ status: 'error', count: 1 });
        return;
      }

      // Initial count
      const initialCount = await fetchGhostCount(supabase);
      if (!mountedRef.current) return;
      
      prevCountRef.current = initialCount;
      setState({ status: 'connected', count: initialCount });
      onCountChange?.(initialCount, 0);

      // Heartbeat every 60 seconds
      heartbeatRef.current = setInterval(async () => {
        if (!mountedRef.current) return;
        await updatePresence();
        
        // Also fetch updated count
        const newCount = await fetchGhostCount(supabase);
        if (!mountedRef.current) return;
        
        const prevCount = prevCountRef.current;
        if (newCount > prevCount && prevCount > 0) {
          onCountChange?.(newCount, prevCount);
        }
        prevCountRef.current = newCount;
        setState({ status: 'connected', count: newCount });
      }, HEARTBEAT_INTERVAL);

      // Poll count more frequently (every 30s)
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) return;
        const newCount = await fetchGhostCount(supabase);
        if (!mountedRef.current) return;
        
        const prevCount = prevCountRef.current;
        if (newCount > prevCount && prevCount > 0) {
          onCountChange?.(newCount, prevCount);
        }
        prevCountRef.current = newCount;
        setState({ status: 'connected', count: newCount });
      }, 30000);
    };

    init();

    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updatePresence, fetchGhostCount, onCountChange]);

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
