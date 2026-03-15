import { useState, useCallback, useRef } from "react";

interface GeoCoords {
  lat: number;
  lng: number;
}

interface UseGeolocationReturn {
  coords: GeoCoords | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<GeoCoords | null>;
}

export function useGeolocation(): UseGeolocationReturn {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<GeoCoords | null>(null);

  const requestLocation = useCallback(async (): Promise<GeoCoords | null> => {
    if (cache.current) {
      setCoords(cache.current);
      return cache.current;
    }

    if (!navigator?.geolocation) {
      setError("Geolocation is not supported by your browser");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });

      const result: GeoCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      cache.current = result;
      setCoords(result);
      setLoading(false);
      return result;
    } catch (e: any) {
      const msg =
        e?.code === 1
          ? "Location access denied. Please enable location permissions."
          : "Unable to get your location. Please try again.";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  return { coords, loading, error, requestLocation };
}
