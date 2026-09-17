"use client";

import { useState, useCallback } from "react";

let audioContext: AudioContext | null = null;
let isMutedGlobal = false;

const MUTE_STORAGE_KEY = "0null_sound_muted";

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    audioContext = new AudioCtx();
  }
  return audioContext;
}

function initAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}

function loadMuteState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(MUTE_STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

function saveMuteState(muted: boolean) {
  if (typeof window === "undefined") return;
  isMutedGlobal = muted;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "true" : "false");
  } catch {
  }
}

export function playSuccess() {
  if (isMutedGlobal) return;
  try {
    initAudio();
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.error("[Sound] playSuccess failed:", e);
  }
}

export function playError() {
  if (isMutedGlobal) return;
  try {
    initAudio();
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(110, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.error("[Sound] playError failed:", e);
  }
}

export function playGhost() {
  if (isMutedGlobal) return;
  try {
    initAudio();
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1200, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
  } catch (e) {
    console.error("[Sound] playGhost failed:", e);
  }
}

export function useSound() {
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      isMutedGlobal = loadMuteState();
    }
    return isMutedGlobal;
  });

  const toggleMute = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    saveMuteState(newMuted);
  }, [muted]);

  return { muted, toggleMute, playSuccess, playError, playGhost };
}
