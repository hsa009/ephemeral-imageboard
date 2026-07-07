"use client";

import { createContext, useContext, useState, useEffect, useCallback, FC, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

interface AuthContextType {
  isAuthenticated: boolean;
  walletAddress: string | null;
  username: string | null;
  hasUsername: boolean;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setUsername: (name: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  walletAddress: null,
  username: null,
  hasUsername: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
  setUsername: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { publicKey, signMessage } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [username, setUsernameState] = useState<string | null>(null);
  const [hasUsername, setHasUsername] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setWalletAddress(data.walletAddress);
          setUsernameState(data.username);
          setHasUsername(data.hasUsername);
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
        const data = await verifyRes.json();
        setWalletAddress(pubKey);
        setUsernameState(data.username || null);
        setHasUsername(data.hasUsername);
      }
    } catch (e) {
      console.error('Login failed:', e);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setWalletAddress(null);
    setUsernameState(null);
    setHasUsername(false);
  }, []);

  const setUsername = useCallback(async (name: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        return data.error || 'Failed to set username';
      }
      setUsernameState(data.username);
      setHasUsername(true);
      return null;
    } catch {
      return 'Failed to set username';
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!walletAddress,
      walletAddress,
      username,
      hasUsername,
      loading,
      login,
      logout,
      setUsername,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
