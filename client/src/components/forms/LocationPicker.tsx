import { useQuery } from '@tanstack/react-query';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { useGeolocation } from '../../hooks/useGeolocation';
import { api, qs } from '../../lib/api';
import type { Place } from '../../lib/types';
import { Field, Input } from '../ui/Form';

export interface GeoValue {
  city: string;
  lat: number;
  lng: number;
}

/** Search a city by name or use the browser location. Always resolves to real coordinates. */
export function LocationPicker({ value, onChange, error, label = 'City or area' }: { value: GeoValue | null; onChange: (v: GeoValue) => void; error?: string; label?: string }) {
  const [text, setText] = useState(value?.city ?? '');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text.trim(), 450);
  const geo = useGeolocation();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ['geo-search', debounced],
    queryFn: () => api.get<{ places: Place[] }>(`/geo/search${qs({ q: debounced })}`),
    enabled: open && debounced.length >= 2 && debounced !== value?.city,
    staleTime: 10 * 60_000,
  });

  const pick = (p: Place) => {
    const city = p.city ?? p.label.split(',')[0]!.trim();
    onChange({ city, lat: p.lat, lng: p.lng });
    setText(city);
    setOpen(false);
  };

  const useMyLocation = async () => {
    setGeoError(null);
    setLocating(true);
    const c = await geo.locate();
    if (!c) {
      setGeoError('Location permission was blocked. Search for your city instead.');
      setLocating(false);
      return;
    }
    try {
      const { place } = await api.get<{ place: Place | null }>(`/geo/reverse${qs({ lat: c.latitude, lng: c.longitude })}`);
      const city = place?.city ?? 'My location';
      onChange({ city, lat: c.latitude, lng: c.longitude });
      setText(city);
    } catch {
      onChange({ city: 'My location', lat: c.latitude, lng: c.longitude });
      setText('My location');
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="relative">
      <Field label={label} error={error ?? geoError ?? undefined} hint={value ? `Pinned at ${value.lat.toFixed(3)}, ${value.lng.toFixed(3)}` : 'Pick a result so we can place you on the map'}>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search your city, for example Amritsar"
          icon={<Search className="size-4" />}
          autoComplete="off"
        />
      </Field>
      <button
        type="button"
        onClick={useMyLocation}
        className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
      >
        {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />} Use my current location
      </button>

      {open && debounced.length >= 2 && debounced !== value?.city && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-ink-200 bg-white p-1.5 shadow-2xl">
          {search.isFetching && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-500">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </li>
          )}
          {search.isError && <li className="px-3 py-2.5 text-sm text-brand-700">Search is unavailable right now. Try again in a moment.</li>}
          {search.data?.places.length === 0 && <li className="px-3 py-2.5 text-sm text-ink-500">No places found. Try a nearby city.</li>}
          {search.data?.places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button type="button" onClick={() => pick(p)} className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-100">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <span className="line-clamp-2">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
