import { createContext } from 'react';

export interface PlaidLinkContextType {
  openPlaid: () => void;
  isLoading: boolean;
  error: string | null;
}

export const PlaidLinkContext = createContext<PlaidLinkContextType | undefined>(undefined);