import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Me } from '../lib/types';

/** The signed-in user's profile from our own database (role, donor profile, hospital link, settings). */
export function useMe() {
  const { isSignedIn, isLoaded } = useAuth();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/users/me'),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
  });
}
