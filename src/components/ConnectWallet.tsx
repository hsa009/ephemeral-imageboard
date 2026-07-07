"use client";

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAuth } from './AuthProvider';

export default function ConnectWallet() {
  const { publicKey } = useWallet();
  const { isAuthenticated, loading, login, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (publicKey && !isAuthenticated) {
      login();
    } else if (!publicKey && isAuthenticated) {
      logout();
    }
  }, [publicKey, isAuthenticated, loading, login, logout]);

  return <WalletMultiButton />;
}
