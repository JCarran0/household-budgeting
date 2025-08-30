import { useContext } from 'react';
import { PlaidLinkContext } from '../contexts/PlaidLinkContext';

export function usePlaid() {
  const context = useContext(PlaidLinkContext);
  if (context === undefined) {
    throw new Error('usePlaid must be used within a PlaidLinkProvider');
  }
  return context;
}