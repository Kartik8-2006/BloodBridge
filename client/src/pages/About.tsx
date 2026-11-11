import { Eye, Gauge, HandHeart, Lock, ShieldCheck, Star } from 'lucide-react';
import { CONTACT } from '../components/site/PublicFooter';
import { PageBanner, PillLink, Section, SectionTitle } from '../components/site/parts';

const VALUES = [
  { icon: ShieldCheck, title: 'Safety', text: 'Only verified hospitals receive requests, and final screening is always done by the hospital.' },
  { icon: HandHeart, title: 'Dignity', text: 'Donors and patients’ families are treated as people, not records. We share the minimum needed.' },
  { icon: Gauge, title: 'Speed', text: 'Matching is automatic and nearby-first, so hours of phone calls become minutes.' },
  { icon: Eye, title: 'Transparency', text: 'Every donation has a certificate anyone can verify, and every review decision is logged.' },
];

export default function About() {
  return (
    <>
      <PageBanner title="About Us" tabs={[{ id: 'mission', label: 'Mission and Vision' }, { id: 'approach', label: 'Our Approach' }, { id: 'safety', label: 'Safety and Trust' }, { id: 'contact', label: 'Contact' }]} />

      <section id="mission" className="grid scroll-mt-40 md:grid-cols-2">
        <div className="bg-plasma-600 px-8 py-16 text-white sm:px-14">
          <span className="mb-6 flex size-14 items-center justify-center rounded-full border-2 border-white/80"><Star className="size-6 fill-white" /></span>
          <h2 className="text-4xl font-black">Our Mission</h2>
          <p className="mt-5 text-lg font-semibold uppercase leading-relaxed tracking-wide">To make sure no patient waits for blood because the right person could not be reached in time.</p>
        </div>
        <div className="bg-brand-600 px-8 py-16 text-white sm:px-14">
          <span className="mb-6 flex size-14 items-center justify-center rounded-full border-2 border-white/80"><Eye className="size-6" /></span>
          <h2 className="text-4xl font-black">Our Vision</h2>
          <p className="mt-5 text-lg font-semibold uppercase leading-relaxed tracking-wide">A country where every city has a living, verified network of donors and hospitals working together.</p>
        </div>
      </section>

      <Section id="approach">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight text-ink-600">How we work</h2>
            <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-500">
              <p>BloodBridge is a coordination layer, not a blood bank. We never store, sell or move blood. We connect the people who need it, the people willing to give it, and the licensed facilities that can safely collect and issue it.</p>
              <p>Hospitals come from OpenStreetMap so patients can find real places from day one. A hospital becomes part of the live network only after its representative submits a licence and our team approves it.</p>
            </div>
          </div>
          <ul className="space-y-4">
            {['Real facilities, not demo data', 'Nearest-first donor matching', 'A one-time code confirms every donation', 'Certificates anyone can verify online'].map((t) => (
              <li key={t} className="flex gap-3 rounded-2xl border-l-4 border-plasma-400 bg-ink-50 p-5 text-lg font-semibold text-ink-700">{t}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="soft">
        <SectionTitle center script="What guides us" title="Our core values" />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="text-center">
              <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand-600 text-white"><Icon className="size-7" /></span>
              <h3 className="text-xl font-extrabold uppercase tracking-wide text-ink-600">{title}</h3>
              <p className="mt-2 text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="safety">
        <SectionTitle script="Built to be trusted" title="Safety and trust" />
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Verified hospitals only', text: 'Blood requests can only be sent to hospitals whose licence our team has reviewed.' },
            { icon: Lock, title: 'Privacy by design', text: 'Hospitals see only donor counts by blood group. A donor’s phone is shared only after they accept a request.' },
            { icon: HandHeart, title: 'Donor protection', text: 'Donors can pause at any time, and eligibility rules keep donations safe for them.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.75rem] border border-ink-100 bg-white p-7 shadow-card">
              <Icon className="size-8 text-brand-600" />
              <h3 className="mt-4 text-xl font-extrabold text-ink-700">{title}</h3>
              <p className="mt-2 leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="contact" tone="soft">
        <div className="mx-auto max-w-2xl text-center">
          <SectionTitle center script="Say hello" title="Contact" />
          {CONTACT.email || CONTACT.phone ? (
            <div className="space-y-2 text-lg text-ink-600">
              {CONTACT.email && <p><a className="font-bold text-brand-700" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>}
              {CONTACT.phone && <p><a className="font-bold text-brand-700" href={`tel:${CONTACT.phone}`}>{CONTACT.phone}</a></p>}
              {CONTACT.address && <p>{CONTACT.address}</p>}
            </div>
          ) : (
            <p className="text-lg text-ink-500">Questions about your hospital’s verification? Sign in and use the notes on your hospital page, our review team replies there.</p>
          )}
          <PillLink to="/sign-up" tone="red" className="mt-8">Join BloodBridge</PillLink>
        </div>
      </Section>
    </>
  );
}
