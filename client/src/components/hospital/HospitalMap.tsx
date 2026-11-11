import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { PublicHospital } from '../../lib/types';

const pin = (verified: boolean, bank: boolean) =>
  L.divIcon({
    className: 'bb-pin',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
    html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 23 13 23s13-13.4 13-23C28 6.8 22.2 1 15 1z" fill="${bank ? '#b01f24' : '#3a414b'}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="14" r="5" fill="#fff"/>
      ${verified ? '<circle cx="15" cy="14" r="2.6" fill="#16a34a"/>' : ''}
    </svg>`,
  });

function FitBounds({ items, center }: { items: PublicHospital[]; center?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (items.length === 0) {
      if (center) map.setView(center, 11);
      return;
    }
    const bounds = L.latLngBounds(items.map((h) => [h.lat, h.lng] as [number, number]));
    if (center) bounds.extend(center);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [items, center, map]);
  return null;
}

export function HospitalMap({ items, center, detailBase, height = 560 }: { items: PublicHospital[]; center?: [number, number]; detailBase: string; height?: number }) {
  return (
    <MapContainer center={center ?? [22.9, 79.5]} zoom={center ? 11 : 5} scrollWheelZoom style={{ height }} className="w-full rounded-3xl border border-ink-100 shadow-card">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds items={items} center={center} />
      {items.map((h) => (
        <Marker key={h.id} position={[h.lat, h.lng]} icon={pin(h.verified, h.type === 'BLOOD_BANK')}>
          <Popup>
            <div className="min-w-44">
              <p className="font-bold text-ink-900">{h.name}</p>
              <p className="mt-0.5 text-xs text-ink-500">{[h.city, h.state].filter(Boolean).join(', ')}</p>
              {h.phone && <p className="mt-1 text-xs">{h.phone}</p>}
              <Link to={`${detailBase}/${h.id}`} className="mt-2 inline-block text-xs font-bold text-brand-700">
                View details
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
      {center && (
        <Marker
          position={center}
          icon={L.divIcon({
            className: 'bb-pin',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.2)"></div>',
          })}
        >
          <Popup>Your location</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
