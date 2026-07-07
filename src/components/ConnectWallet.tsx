"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from './AuthProvider';

export default function ConnectWallet() {
  const { select, wallets, publicKey, connected, connecting } = useWallet();
  const { isAuthenticated, walletAddress, loading, login, logout } = useAuth();

  const handleClick = async () => {
    if (isAuthenticated) {
      logout();
      return;
    }
    if (!connected) {
      const wallet = wallets.find(w => w.readyState === 'Installed' || w.adapter.name === 'Phantom');
      if (wallet) {
        select(wallet.adapter.name);
      } else {
        window.open('https://phantom.app/', '_blank');
      }
      return;
    }
    if (publicKey && !isAuthenticated) {
      await login();
    }
  };

  let label = 'Connect Wallet';
  if (connecting) label = 'Connecting...';
  if (connected && !isAuthenticated && !loading) label = 'Sign to Verify';
  if (connected && !isAuthenticated && loading) label = 'Verifying...';
  if (isAuthenticated && walletAddress) {
    label = `${walletAddress.slice(0, 4)}..${walletAddress.slice(-4)}`;
  }

  return (
    <button className="connect-wallet" onClick={handleClick} disabled={loading && !isAuthenticated}>
      {connecting || (loading && !isAuthenticated) ? (
        <span className="wallet-spinner" />
      ) : isAuthenticated ? (
        <span className="wallet-dot" />
      ) : null}
      {label}
    </button>
  );
}
