import { BadgeCheck, BookOpen, HeartPulse, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageBanner, Section, SectionTitle } from '../components/site/parts';

const RESOURCES = [
  { icon: HeartPulse, title: 'Blood compatibility', text: 'Understand red-cell donor and recipient compatibility before speaking with a hospital team.', to: '/get-blood#compatibility', action: 'View compatibility chart' },
  { icon: BookOpen, title: 'Donation guide', text: 'See who can donate, what happens at a donation centre, and how to prepare for your visit.', to: '/donate#eligibility', action: 'Read donor guide' },
  { icon: ShieldCheck, title: 'Safety and privacy', text: 'Learn how verified hospitals, consent and one-time donation codes keep the network safe.', to: '/about#safety', action: 'Explore safety' },
  { icon: BadgeCheck, title: 'Certificate verification', text: 'Confirm a donation certificate using its unique number and view its verified details.', to: '/verify', action: 'Verify a certificate' },
];

export default function Resources() {
  return (
    <>
      <PageBanner title="Resources" text="Clear, practical information for donors, patients’ families and hospital teams." tabs={[{ id: 'guides', label: 'Guides' }, { id: 'support', label: 'Need help?' }]} />
      <Section id="guides">
        <SectionTitle script="Know before you go" title="Helpful guides for every role" text="Use these resources to make informed, safe decisions at every stage of a blood request or donation." />
        <div className="grid gap-6 sm:grid-cols-2">
          {RESOURCES.map(({ icon: Icon, title, text, to, action }) => (
            <Link key={title} to={to} className="group flex gap-5 rounded-[1.75rem] border border-ink-100 bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-xl">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="size-7" /></span>
              <span><span className="block text-xl font-extrabold text-ink-700">{title}</span><span className="mt-2 block leading-relaxed text-ink-500">{text}</span><span className="mt-5 block text-sm font-extrabold uppercase tracking-wider text-plasma-600 group-hover:text-brand-700">{action}</span></span>
            </Link>
          ))}
        </div>
      </Section>
      <Section id="support" tone="soft">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-wine-900 px-8 py-10 text-center text-white sm:px-14">
          <p className="font-script text-3xl text-plasma-300">Need a hand?</p>
          <h2 className="mt-2 text-3xl font-black">Start with the right next step.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-brand-100">For an urgent blood request, locate an emergency-ready hospital first, then use BloodBridge to reach compatible donors.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/get-blood" className="rounded-full bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-brand-700">Request blood</Link><Link to="/how-it-works#faq" className="rounded-full border-2 border-white/70 px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-white">Read FAQs</Link></div>
        </div>
      </Section>
    </>
  );
}
