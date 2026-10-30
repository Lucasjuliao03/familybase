import { createContext, useContext } from 'react';

export const PWAContext = createContext(null);

export function usePWA() {
  return useContext(PWAContext);
}
