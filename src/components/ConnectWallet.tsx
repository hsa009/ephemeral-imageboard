"use client";

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from './AuthProvider';
import WalletSelectModal from './WalletSelectModal';
import UsernameModal from './UsernameModal';

export default function ConnectWallet() {
  const { connected, publicKey, connecting } = useWallet();
  const { isAuthenticated, walletAddress, username, hasUsername, loading, login, logout, setUsername } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showUsername, setShowUsername] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (publicKey && !isAuthenticated) {
      login();
    }
  }, [publicKey, loading]);

  useEffect(() => {
    if (!loading && isAuthenticated && !hasUsername) {
      setShowUsername(true);
    }
  }, [isAuthenticated, hasUsername, loading]);

  const handleClick = useCallback(async () => {
    if (isAuthenticated) {
      logout();
      return;
    }
    if (!connected) {
      setShowModal(true);
      return;
    }
    if (publicKey && !isAuthenticated) {
      await login();
    }
  }, [isAuthenticated, connected, publicKey, login, logout]);

  const handleSkip = useCallback(async () => {
    const err = await setUsername('');
    if (err) {
      console.error('Failed to generate default username:', err);
    }
    setShowUsername(false);
  }, [setUsername]);

  let label = 'Connect Wallet';
  if (connecting) label = 'Connecting...';
  if (connected && !isAuthenticated && !loading) label = 'Sign to Verify';
  if (connected && !isAuthenticated && loading) label = 'Verifying...';
  if (isAuthenticated && walletAddress) {
    if (hasUsername && username) {
      label = username;
    } else {
      label = `${walletAddress.slice(0, 4)}..${walletAddress.slice(-4)}`;
    }
  }

  if (isAuthenticated) {
    return (
      <>
        <button className="disconnect-btn" onClick={handleClick} aria-label="Disconnect wallet">
          <span className="status-dot" aria-hidden="true"></span>
          <span className="handle">{label}</span>
          <span className="disconnect-label">disconnect</span>
        </button>
        {showUsername && <UsernameModal onSubmit={setUsername} onSkip={handleSkip} onClose={() => setShowUsername(false)} />}
      </>
    );
  }

  return (
    <>
      <button className="connect-wallet" onClick={handleClick} disabled={loading && !isAuthenticated}>
        {(connecting || (loading && !isAuthenticated)) && <span className="wallet-spinner" />}
        {label}
      </button>
      <WalletSelectModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
