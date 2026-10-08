import { useCallback, useState } from 'react';

// The free native SDK does not support browser previews. Metro selects .native.ts on devices.
export function useGoogleSignIn(_onSuccess?: () => void) {
  const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async () => {
    setError('Para entrar com Google, use a development build Android ou iOS do EventMap.');
  }, []);
  return { signIn, busy: false, error, enabled: false };
}
