import { createContext } from 'react';
import type { User } from '../lib/types.ts';

export type AuthContextValue = {
  user: User | null;
  asOf: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAsOf: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
