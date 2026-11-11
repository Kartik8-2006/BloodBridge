import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight, HeartPulse, ShieldCheck, Siren } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { FactPanel, FeatureCard, PillLink, Script, Section, SectionTitle, SplitHero } from '../components/site/parts';
import { api } from '../lib/api';
import { number } from '../lib/format';
import type { FacilityType, PublicStats } from '../lib/types';

const SLIDES = [
  { script: 'Step one', title: 'Someone needs blood', text: 'A family member posts a request for a patient at a verified hospital: blood group, units and how urgent it is.', icon: Siren },
  { script: 'Step two', title: 'Matching donors are alerted', text: 'We find compatible, eligible, available donors near the hospital and alert them instantly. Their details stay private.', icon: HeartPulse },
  { script: 'Step three', title: 'A code confirms the donation', text: 'The donor shows a 6 digit code at the hospital desk. Staff confirm it, and the donor gets a certificate anyone can verify.', icon: ShieldCheck },
] as const;
const SLIDE_IMAGES = ['/images/hospital-hero.png', '/images/community-hero.png', '/images/donor-hero.png'];

function Slides() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6500);
    return () => clearInterval(id);
  }, [paused]);
  const s = SLIDES[i]!;
  const go = (d: number) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);
  return (
    <section className="bg-ink-100" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel" aria-label="How a request works">
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 py-14 sm:px-16 md:grid-cols-[1.2fr_1fr]">
        <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-2 top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-ink-700 text-white hover:bg-ink-900 sm:grid"><ChevronLeft className="size-5" /></button>
        <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-2 top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-ink-700 text-white hover:bg-ink-900 sm:grid"><ChevronRight className="size-5" /></button>
        <div key={i} className="rise-in" aria-live="polite">
          <Script>{s.script}</Script>
          <h2 className="mt-1 text-3xl font-black leading-tight text-ink-700 sm:text-4xl">{s.title}</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-500">{s.text}</p>
          <PillLink to="/how-it-works" tone="gold" className="mt-6">See the full flow</PillLink>
        </div>
        <div className="mx-auto size-52 overflow-hidden rounded-[2.5rem] shadow-xl sm:size-64"><img src={SLIDE_IMAGES[i]} alt="" className="size-full object-cover" /></div>
      </div>
      <div className="flex justify-center gap-2.5 pb-8">
        {SLIDES.map((_, n) => (
          <button key={n} type="button" onClick={() => setI(n)} aria-label={`Show step ${n + 1}`} aria-current={n === i} className={clsx('size-3 cursor-pointer rounded-full transition', n === i ? 'bg-plasma-600' : 'bg-ink-300')} />
        ))}
      </div>
    </section>
  );
}

const TYPE_LABEL: Record<FacilityType, string> = { HOSPITAL: 'Hospital', BLOOD_BANK: 'Blood bank' };
interface NetworkItem { id: string; name: string; city: string | null; state: string | null; type: FacilityType; hasEmergency: boolean }

export default function Landing() {
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<PublicStats>('/public/stats'), staleTime: 60_000 });
  const net = useQuery({ queryKey: ['public-network'], queryFn: () => api.get<{ items: NetworkItem[] }>('/public/network'), staleTime: 60_000 });
  const s = stats.data;

  return (
    <>
      <SplitHero
        script="Every drop counts"
        title={<>Blood help, <span className="text-plasma-300">without delay.</span></>}
        text="BloodBridge connects patients’ families, willing donors and verified hospitals, so the right help is reached in minutes instead of hours of phone calls."
        actions={<><PillLink to="/hospitals" tone="wine">Find blood</PillLink><PillLink to="/sign-up" tone="white">Donate blood</PillLink></>}
        art={<img src="/images/donor-hero.png" alt="Blood donor at a donation centre" className="absolute inset-0 size-full object-cover" />}
        tabs={[{ to: '/get-blood', label: 'Request blood' }, { to: '/donate', label: 'Donate blood' }, { to: '/how-it-works', label: 'How it works' }, { to: '/for-hospitals', label: 'For hospitals' }]}
      />

      <Section>
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard to="/donate" title="Become a Donor" text="Check your eligibility, set your location and get alerted when a patient near you needs your group."
            art={<img src="/images/donor-hero.png" alt="Blood donor at a donation centre" className="size-full object-cover" />} />
          <FeatureCard to="/get-blood" title="Find Blood" text="Search real hospitals and blood banks near you, then send a request to a verified one."
            art={<img src="/images/hospital-hero.png" alt="Hospital blood bank team" className="size-full object-cover" />} />
          <FeatureCard to="/for-hospitals" title="For Hospitals" text="Claim your facility, get verified and receive requests with donors on the way."
            art={<img src="/images/community-hero.png" alt="Blood donation community volunteers" className="size-full object-cover" />} />
        </div>
      </Section>

      <Slides />

      <section className="grid md:grid-cols-3" aria-label="Network at a glance">
        <FactPanel tone="gold" value={s ? number(s.donors) : '…'} label={`donors registered${s && s.cities > 0 ? ` across ${number(s.cities)} ${s.cities === 1 ? 'city' : 'cities'}` : ''}`} note="Live on BloodBridge" />
        <FactPanel tone="red" value={s ? number(s.verifiedHospitals) : '…'} label={`facilities verified by our review team, out of ${s ? number(s.listedFacilities) : '…'} mapped`} note="Verified network" />
        <FactPanel tone="wine" value={s ? number(s.donations) : '…'} label="donations confirmed at hospital desks" note="One donation can help up to 3 patients" />
      </section>

      <Section>
        <SectionTitle center script="Latest from the network" title="Newly verified hospitals" text="Facilities that completed our document review and can now receive blood requests." />
        {net.data && net.data.items.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {net.data.items.map((h) => (
              <article key={h.id} className="flex overflow-hidden rounded-[1.75rem] border border-ink-100 bg-white shadow-card">
                <div className="grid w-28 shrink-0 place-items-center bg-gradient-to-br from-brand-600 to-wine-900 text-white sm:w-44"><Building2 className="size-12" strokeWidth={1.4} /></div>
                <div className="min-w-0 p-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{TYPE_LABEL[h.type]}{h.hasEmergency ? ' · Emergency care' : ''}</p>
                  <h3 className="mt-1 truncate text-xl font-extrabold text-ink-700">{h.name}</h3>
                  <p className="mt-1 text-sm text-ink-500">{[h.city, h.state].filter(Boolean).join(', ') || 'Location on file'}</p>
                  <Link to={`/hospitals/${h.id}`} className="mt-4 inline-block rounded-full bg-plasma-600 px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-700">View hospital</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-dashed border-ink-200 bg-ink-50 p-10 text-center">
            <p className="text-lg font-bold text-ink-700">No hospital is verified yet.</p>
            <p className="mt-2 text-ink-500">Be the first in your city. Claim your listing, submit your licence and start receiving requests.</p>
            <PillLink to="/for-hospitals" tone="red" className="mt-6">Register your hospital</PillLink>
          </div>
        )}
        <div className="mt-10 flex justify-center"><PillLink to="/hospitals" tone="gold" className="w-full max-w-xl !py-4">Search all hospitals and blood banks</PillLink></div>
      </Section>
    </>
  );
}
