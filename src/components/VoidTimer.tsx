"use client";

import { useState, useEffect } from "react";

// 48 hours in milliseconds
const TTL_MS = 48 * 60 * 60 * 1000;

interface VoidTimerProps {
  lastBumpAt: string;
  onExpired?: () => void;
}

export default function VoidTimer({ lastBumpAt, onExpired }: VoidTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const expirationTime = new Date(lastBumpAt).getTime() + TTL_MS;
      const remaining = expirationTime - now;
      
      if (remaining <= 0) {
        setIsExpired(true);
        setTimeLeft(0);
        onExpired?.();
      } else {
        setIsExpired(false);
        setTimeLeft(remaining);
      }
    };

    // Calculate immediately
    calculateTimeLeft();

    // Update every minute (or every second if under 1 hour)
    const remaining = new Date(lastBumpAt).getTime() + TTL_MS - Date.now();
    const interval = remaining < 3600000 ? 1000 : 60000;

    const timer = setInterval(calculateTimeLeft, interval);
    return () => clearInterval(timer);
  }, [lastBumpAt, onExpired]);

  // Calculate visual severity
  const getUrgency = () => {
    if (isExpired) return 'expired';
    if (timeLeft < 3600000) return 'critical'; // < 1 hour
    if (timeLeft < 43200000) return 'warning'; // < 12 hours
    return 'normal';
  };

  const formatTime = () => {
    if (isExpired) return { text: 'VOID', sub: 'EXPIRED' };
    
    const hours = Math.floor(timeLeft / 3600000);
    const minutes = Math.floor((timeLeft % 3600000) / 60000);
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return { text: `${days}d ${remainingHours}h`, sub: 'REMAINING' };
    }
    
    return { text: `${hours}h ${minutes}m`, sub: 'REMAINING' };
  };

  const urgency = getUrgency();
  const display = formatTime();

  return (
    <div className={`void-timer ${urgency}`}>
      <span className="void-label">VOID IN:</span>
      <span className="void-time">{display.text}</span>
      {urgency === 'critical' && <span className="void-pulse" />}
    </div>
  );
}

// Utility function for filtering expired threads
export function isThreadExpired(lastBumpAt: string): boolean {
  const now = Date.now();
  const expirationTime = new Date(lastBumpAt).getTime() + TTL_MS;
  return now >= expirationTime;
}

// Get time remaining for display
export function getTimeRemaining(lastBumpAt: string): number {
  const now = Date.now();
  const expirationTime = new Date(lastBumpAt).getTime() + TTL_MS;
  return Math.max(0, expirationTime - now);
}
