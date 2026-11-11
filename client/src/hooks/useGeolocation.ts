import { useCallback, useState } from 'react';

export interface Coords {
  latitude: number;
  longitude: number;
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback((): Promise<Coords | null> => {
    if (!('geolocation' in navigator)) {
      setError('Your browser does not support location.');
      return Promise.resolve(null);
    }
    setLoading(true);
    setError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setCoords(c);
          setLoading(false);
          resolve(c);
        },
        (err) => {
          setError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      );
    });
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { coords, loading, error, locate, clear };
}
