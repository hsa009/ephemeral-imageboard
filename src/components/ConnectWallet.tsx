"use client";

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from './AuthProvider';
import WalletSelectModal from './WalletSelectModal';

export default function ConnectWallet() {
  const { connected, publicKey, connecting } = useWallet();
  const { isAuthenticated, walletAddress, loading, login, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);

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

  let label = 'Connect Wallet';
  if (connecting) label = 'Connecting...';
  if (connected && !isAuthenticated && !loading) label = 'Sign to Verify';
  if (connected && !isAuthenticated && loading) label = 'Verifying...';
  if (isAuthenticated && walletAddress) {
    label = `${walletAddress.slice(0, 4)}..${walletAddress.slice(-4)}`;
  }

  return (
    <>
      <button className={`connect-wallet${isAuthenticated ? ' authenticated' : ''}`} onClick={handleClick} disabled={loading && !isAuthenticated}>
        {connecting || (loading && !isAuthenticated) ? (
          <span className="wallet-spinner" />
        ) : isAuthenticated ? (
          <span className="wallet-dot" />
        ) : null}
        {label}
      </button>
      <WalletSelectModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
