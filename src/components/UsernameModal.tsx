"use client";

import { useState, useRef, useEffect } from 'react';

interface UsernameModalProps {
  onSubmit: (username: string) => Promise<string | null>;
  onSkip: () => Promise<void>;
  onClose: () => void;
}

export default function UsernameModal({ onSubmit, onSkip, onClose }: UsernameModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    const err = await onSubmit(value.trim());
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="username-modal-overlay">
      <div className="username-modal">
        <div className="username-modal-title">Choose a Username</div>
        <div className="username-modal-desc">
          Pick a handle to display on the board. You can skip this — we&apos;ll generate one for you.
        </div>
        <input
          ref={inputRef}
          className="username-input"
          type="text"
          placeholder="your_handle"
          maxLength={15}
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={busy}
        />
        <div className="username-constraint">Letters, numbers, underscores — max 15 chars</div>
        {error && <div className="username-error">{error}</div>}
        <div className="username-actions">
          <button className="username-btn" onClick={handleSubmit} disabled={busy}>
            {busy ? <><span className="wallet-spinner" /> Saving...</> : 'Set Username'}
          </button>
          <button className="username-skip" onClick={onSkip} disabled={busy}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
