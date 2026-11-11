import { useQuery } from '@tanstack/react-query';
import { Building2, List, Loader2, Map as MapIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { LocationPicker, type GeoValue } from '../components/forms/LocationPicker';
import { HospitalCard } from '../components/hospital/HospitalCard';
import { HospitalMap } from '../components/hospital/HospitalMap';
import { Checkbox, Field, Input, Select } from '../components/ui/Form';
import { EmptyState, ErrorNote, PageHeader } from '../components/ui/Misc';
import { useDebounce } from '../hooks/useDebounce';
import { useMe } from '../hooks/useMe';
import { api, qs } from '../lib/api';
import type { HospitalSearch } from '../lib/types';

export default function Hospitals() {
  const base = useLocation().pathname.startsWith('/app') ? '/app/hospitals' : '/hospitals';
  const [params, setParams] = useSearchParams();
  const { data: me } = useMe();

  const [place, setPlace] = useState<GeoValue | null>(null);
  const [radiusKm, setRadiusKm] = useState('10');
  const [type, setType] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [text, setText] = useState(params.get('q') ?? '');
  const [view, setView] = useState<'list' | 'map'>('list');
  const q = useDebounce(text.trim(), 400);

  // Start from the signed-in user's own saved location, so the page is useful immediately.
  const homeLat = me?.donor?.lat ?? me?.user.lat ?? null;
  const homeLng = me?.donor?.lng ?? me?.user.lng ?? null;
  const homeCity = me?.donor?.city ?? me?.user.city ?? null;
  useEffect(() => {
    if (!place && homeLat !== null && homeLng !== null) setPlace({ city: homeCity ?? 'My location', lat: homeLat, lng: homeLng });
  }, [homeLat, homeLng, homeCity, place]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [q, params, setParams]);

  const enabled = !!place || q.length >= 2;
  const search = useQuery({
    queryKey: ['hospitals', place?.lat, place?.lng, radiusKm, type, verifiedOnly, q],
    queryFn: () =>
      api.get<HospitalSearch>(
        `/hospitals${qs({ lat: place?.lat, lng: place?.lng, radiusKm: place ? radiusKm : undefined, type, verifiedOnly: verifiedOnly || undefined, q })}`,
      ),
    enabled,
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  const items = search.data?.items ?? [];
  const canRequest = me?.user.role === 'REQUESTER';
  const center: [number, number] | undefined = place ? [place.lat, place.lng] : undefined;

  return (
    <div>
      <PageHeader
        title="Find hospitals and blood banks"
        subtitle="Real facilities from OpenStreetMap, with the ones our review team has verified shown first."
        right={
          <div className="inline-flex rounded-xl bg-ink-100 p-1">
            {([['list', List, 'List'], ['map', MapIcon, 'Map']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition', view === v ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-8 grid gap-5 rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <LocationPicker label="Search near" value={place} onChange={setPlace} />
        <div className="grid content-start gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <Field label="Distance">
            <Select value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} disabled={!place}>
              {[5, 10, 25, 50].map((r) => (
                <option key={r} value={r}>{r} km</option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              <option value="HOSPITAL">Hospitals</option>
              <option value="BLOOD_BANK">Blood banks</option>
            </Select>
          </Field>
          <Field label="Name">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Hospital name" />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Checkbox checked={verifiedOnly} onChange={setVerifiedOnly}>Show only facilities verified on BloodBridge</Checkbox>
        </div>
      </div>

      {!enabled && (
        <EmptyState icon={<Building2 className="size-6" />} title="Choose where to look" body="Search for your city or use your current location to see hospitals and blood banks nearby." />
      )}

      {enabled && search.isFetching && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-sm text-ink-600">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-600" />
          <span>
            Looking up facilities{place ? ` around ${place.city}` : ''}. The first search in a new area imports real hospitals from OpenStreetMap and can take up to a minute.
          </span>
        </div>
      )}

      {search.isError && <ErrorNote>{search.error instanceof Error ? search.error.message : 'Search failed.'}</ErrorNote>}
      {search.data?.sync?.status === 'failed' && (
        <div className="mb-5">
          <ErrorNote>OpenStreetMap could not be reached just now, so these results may be incomplete. Try again in a minute.</ErrorNote>
        </div>
      )}

      {enabled && !search.isFetching && !search.isError && items.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No facilities found here"
          body={place ? 'Try a larger distance or a nearby city.' : 'Check the spelling or search by city instead.'}
        />
      )}

      {canRequest && (
        <p className="mb-5 rounded-2xl bg-plasma-100 px-5 py-3 text-sm text-ink-800">
          To raise a blood request, choose a hospital marked <strong>On BloodBridge</strong> and press <strong>Request blood</strong>. Hospitals that are only <em>Listed</em> have not joined yet, so they cannot receive requests.
        </p>
      )}

      {items.length > 0 && (
        <>
          <p className="mb-4 text-sm font-semibold text-ink-600">
            {items.length} {items.length === 1 ? 'facility' : 'facilities'} found · {items.filter((i) => i.verified).length} verified
          </p>
          {view === 'map' ? (
            <HospitalMap items={items} center={center} detailBase={base} />
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {items.map((h) => (
                <HospitalCard key={h.id} h={h} to={`${base}/${h.id}`} requestTo={canRequest ? `/app/requests/new?hospital=${h.id}` : undefined} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
