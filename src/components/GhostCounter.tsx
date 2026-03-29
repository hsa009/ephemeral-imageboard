"use client";

import { useState, useEffect, useRef } from "react";

export default function GhostCounter() {
  const [ghostCount, setGhostCount] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    let mounted = true;

    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!mounted) return;

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase.channel("global-presence", {
        config: { presence: { key: `ghost-${Date.now()}-${Math.random()}` } }
      });

      channelRef.current = channel;

      // Track presence
      channel.track({ online_at: new Date().toISOString() });

      // Listen for presence sync
      channel.on("presence", { event: "sync" }, () => {
        if (!mounted) return;
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setGhostCount(count);
      });

      // Listen for join/leave
      channel.on("presence", { event: "join" }, () => {
        if (!mounted) return;
        const state = channel.presenceState();
        setGhostCount(Object.keys(state).length);
      });

      channel.on("presence", { event: "leave" }, () => {
        if (!mounted) return;
        const state = channel.presenceState();
        setGhostCount(Object.keys(state).length);
      });

      // Subscribe and set connected
      channel.subscribe((status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          const state = channel.presenceState();
          setGhostCount(Object.keys(state).length);
        }
      });
    });

    return () => {
      mounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, []);

  return (
    <div className="ghost-counter">
      <span className="ghost-icon">{isConnected ? "⚡" : "○"}</span>
      <span className="ghost-count">
        {ghostCount !== null ? ghostCount : "--"}
      </span>
      <span className="ghost-label">GHOSTS</span>
      {isConnected && <span className="ghost-pulse" />}
    </div>
  );
}
