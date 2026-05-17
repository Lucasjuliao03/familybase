import { useEffect } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { FAMILIA_CONTROLLED_RESUME } from '../lib/appResumeEvents';

function createFamiliaQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        placeholderData: (previousData) => previousData,
      },
    },
  });
}

/** Uma instância por ciclo de vida da app (SPA). */
const browserClient = createFamiliaQueryClient();

/**
 * Ouve o evento único da retoma controlada (Auth) e revalida em segundo plano só queries **ativas**,
 * alinhando com UX do `useAutoRefresh` sem novo listener por página.
 */
function FamiliaResumeQuerySync({ client }) {
  useEffect(() => {
    const onControlled = () => {
      client.invalidateQueries({ refetchType: 'active' });
    };
    window.addEventListener(FAMILIA_CONTROLLED_RESUME, onControlled);
    return () => window.removeEventListener(FAMILIA_CONTROLLED_RESUME, onControlled);
  }, [client]);
  return null;
}

export default function FamiliaQueryProvider({ children }) {
  return (
    <QueryClientProvider client={browserClient}>
      <FamiliaResumeQuerySync client={browserClient} />
      {children}
    </QueryClientProvider>
  );
}
