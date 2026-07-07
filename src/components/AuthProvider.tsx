"use client";

import { createContext, useContext, useState, useEffect, useCallback, FC, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

interface AuthContextType {
  isAuthenticated: boolean;
  walletAddress: string | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  walletAddress: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { publicKey, signMessage } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setWalletAddress(data.walletAddress);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    try {
      const chalRes = await fetch('/api/auth/challenge');
      const { challenge } = await chalRes.json();

      const encodedMessage = new TextEncoder().encode(challenge);
      const signedMessage = await signMessage(encodedMessage);
      const signature = bs58.encode(signedMessage);

      const pubKey = publicKey.toBase58();
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubKey, signature, challenge }),
      });
      if (verifyRes.ok) {
        setWalletAddress(pubKey);
      }
    } catch (e) {
      console.error('Login failed:', e);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setWalletAddress(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!walletAddress, walletAddress, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
