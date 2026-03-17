import { useState, useCallback, useRef } from "react";
import { lookupZip } from "@/lib/api";

interface GeoCoords {
  lat: number;
  lng: number;
}

interface UseGeolocationReturn {
  coords: GeoCoords | null;
  loading: boolean;
  error: string | null;
  zipMode: boolean;
  requestLocation: () => Promise<GeoCoords | null>;
  setFromZip: (zip: string) => Promise<GeoCoords | null>;
  clearCoords: () => void;
}

export function useGeolocation(): UseGeolocationReturn {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipMode, setZipMode] = useState(false);
  const cache = useRef<GeoCoords | null>(null);

  const requestLocation = useCallback(async (): Promise<GeoCoords | null> => {
    if (cache.current) {
      setCoords(cache.current);
      setZipMode(false);
      return cache.current;
    }

    if (!navigator?.geolocation) {
      setError("Geolocation not supported — enter a ZIP code instead.");
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
      setZipMode(false);
      setLoading(false);
      return result;
    } catch (e: any) {
      const msg =
        e?.code === 1
          ? "Location denied — enter a ZIP code instead."
          : "Unable to get location — enter a ZIP code instead.";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  const setFromZip = useCallback(async (zip: string): Promise<GeoCoords | null> => {
    if (!zip.trim()) return null;
    setLoading(true);
    setError(null);
    try {
      const data = await lookupZip(zip);
      const lat = data?.lat ?? data?.latitude;
      const lng = data?.lng ?? data?.longitude;
      if (lat != null && lng != null) {
        const result: GeoCoords = { lat: Number(lat), lng: Number(lng) };
        cache.current = result;
        setCoords(result);
        setZipMode(true);
        setLoading(false);
        return result;
      }
      setError("ZIP code not found.");
      setLoading(false);
      return null;
    } catch {
      setError("Unable to look up ZIP code.");
      setLoading(false);
      return null;
    }
  }, []);

  const clearCoords = useCallback(() => {
    setCoords(null);
    cache.current = null;
    setError(null);
    setZipMode(false);
  }, []);

  return { coords, loading, error, zipMode, requestLocation, setFromZip, clearCoords };
}
