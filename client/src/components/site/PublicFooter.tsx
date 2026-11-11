import { Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/Misc';
import { DropBorder } from './art';
import { PillLink, Script } from './parts';
import { SubscribeForm } from './SubscribeForm';

const env = import.meta.env as Record<string, string | undefined>;
/** Contact details come from deployment settings, never hardcoded. Blocks are hidden when unset. */
export const CONTACT = { phone: env.VITE_SUPPORT_PHONE, email: env.VITE_SUPPORT_EMAIL, address: env.VITE_SUPPORT_ADDRESS };

export function SubscribeSection() {
  return (
    <section className="relative overflow-hidden bg-plasma-600 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 rotate-180 text-white/90"><DropBorder className="text-white" /></div>
      <svg viewBox="0 0 200 260" className="pointer-events-none absolute -left-24 top-10 size-[28rem] text-white/10" fill="currentColor" aria-hidden>
        <path d="M100 8C70 56 20 96 20 160a80 80 0 0 0 160 0C180 96 130 56 100 8z" />
      </svg>
      <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-28 text-center sm:pb-20">
        <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Stay Up To Date</h2>
        <p className="mx-auto mb-10 mt-3 max-w-xl text-white/90">Camp announcements and shortage alerts in your city. No spam, and you can leave any time.</p>
        <SubscribeForm />
      </div>
    </section>
  );
}

const cols = [
  { title: 'Find blood', links: [['/hospitals', 'Search hospitals'], ['/get-blood', 'How to request'], ['/get-blood#compatibility', 'Compatibility']] },
  { title: 'Give blood', links: [['/donate', 'Become a donor'], ['/donate#eligibility', 'Eligibility'], ['/verify', 'Verify a certificate']] },
  { title: 'Hospitals', links: [['/for-hospitals', 'Join the network'], ['/for-hospitals#verification', 'Verification'], ['/about#safety', 'Safety and trust']] },
] as const;

export function PublicFooter() {
  return (
    <>
      <SubscribeSection />
      <footer className="bg-plasma-600 text-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-10 border-t border-white/25 py-12 md:grid-cols-[1.3fr_repeat(3,1fr)]">
            <div>
              <Logo light />
              <Script className="mt-4 !text-2xl !text-white/90">Every drop counts</Script>
              <ul className="mt-5 space-y-3 text-sm">
                {CONTACT.phone && <li className="flex gap-2.5"><Phone className="mt-0.5 size-4 shrink-0" /><a href={`tel:${CONTACT.phone}`}>{CONTACT.phone}</a></li>}
                {CONTACT.email && <li className="flex gap-2.5"><Mail className="mt-0.5 size-4 shrink-0" /><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>}
                {CONTACT.address && <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0" />{CONTACT.address}</li>}
              </ul>
              {CONTACT.email && <PillLink to={`mailto:${CONTACT.email}`} tone="white" className="mt-6 !py-2.5">Contact us</PillLink>}
            </div>
            {cols.map((c) => (
              <nav key={c.title} aria-label={c.title}>
                <p className="mb-4 text-sm font-extrabold uppercase tracking-widest text-white">{c.title}</p>
                <ul className="space-y-3 text-sm text-white/90">
                  {c.links.map(([to, label]) => <li key={label}><Link to={to} className="hover:underline">{label}</Link></li>)}
                </ul>
              </nav>
            ))}
          </div>
          <p className="border-t border-white/25 py-6 text-xs leading-relaxed text-white/85">
            BloodBridge is a coordination platform. Blood is never sold here: hospitals and blood banks handle screening, collection and issue under their own licences. In an emergency, call your local emergency number first.
          </p>
        </div>
      </footer>
    </>
  );
}
