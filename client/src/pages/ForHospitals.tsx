import { BadgeCheck, BellRing, ClipboardCheck, FileText, Users } from 'lucide-react';
import { PageBanner, PillLink, Section, SectionTitle } from '../components/site/parts';

const BENEFITS = [
  { icon: BellRing, title: 'Requests that come with donors', text: 'Families send requests to you, and nearby matching donors are alerted automatically.' },
  { icon: Users, title: 'Know your donor pool', text: 'See how many donors of each blood group live near you, without exposing anyone’s identity.' },
  { icon: ClipboardCheck, title: 'Confirm at the desk', text: 'Enter the donor’s 6 digit code to record the donation and issue a verifiable certificate.' },
];
const STEPS = [
  ['Sign up as a hospital', 'Create an account with your work details and choose “I represent a hospital”.'],
  ['Claim or register your facility', 'Find your hospital in the directory and claim it, or register it if it is missing.'],
  ['Submit your licence', 'Upload your registration or blood-bank licence (PDF, JPG or PNG up to 5 MB).'],
  ['Get verified', 'Our team reviews the documents. Once approved you appear as verified and can receive requests.'],
];

export default function ForHospitals() {
  return (
    <>
      <PageBanner title="For Hospitals" text="Join the verified network and let donors come to you." tabs={[{ id: 'benefits', label: 'Benefits' }, { id: 'verification', label: 'Verification' }]} />
      <Section id="benefits">
        <SectionTitle script="Why join" title="Built for hospital teams" />
        <div className="grid gap-6 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.75rem] border border-ink-100 bg-white p-7 shadow-card">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white"><Icon className="size-6" /></span>
              <h3 className="mt-4 text-xl font-extrabold text-ink-700">{title}</h3>
              <p className="mt-2 leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="verification" tone="soft">
        <SectionTitle center script="Getting started" title="How verification works" />
        <ol className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-5 rounded-[1.75rem] bg-white p-6 shadow-card">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-plasma-600 text-xl font-black text-white">{i + 1}</span>
              <div><h3 className="text-lg font-extrabold text-ink-700">{t}</h3><p className="mt-1 leading-relaxed text-ink-500">{d}</p></div>
            </li>
          ))}
        </ol>
        <div className="mx-auto mt-12 flex max-w-4xl flex-col items-start justify-between gap-6 rounded-[2rem] bg-brand-700 p-8 text-white sm:flex-row sm:items-center">
          <div>
            <h3 className="text-2xl font-extrabold">Ready to join?</h3>
            <p className="mt-1 flex items-center gap-2 text-brand-100"><BadgeCheck className="size-5" /> Your licence stays private and is seen only by our review team.</p>
            <p className="mt-1 flex items-center gap-2 text-brand-100"><FileText className="size-5" /> Keep your licence number and a clear scan handy.</p>
          </div>
          <PillLink to="/sign-up" tone="white" className="shrink-0">Register your hospital</PillLink>
        </div>
      </Section>
    </>
  );
}
