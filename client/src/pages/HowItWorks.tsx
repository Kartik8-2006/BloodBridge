import { Building2, ChevronDown, HeartPulse, ShieldCheck, Siren } from 'lucide-react';
import { PageBanner, Section, SectionTitle } from '../components/site/parts';

const ROLES = [
  { icon: HeartPulse, title: 'Donors', text: 'Set up an eligibility-checked profile, get alerts for compatible nearby patients, accept with one tap and collect certificates.' },
  { icon: Siren, title: 'Requesters', text: 'Patients’ families send a request to a verified hospital and watch donors accept in real time.' },
  { icon: Building2, title: 'Hospitals', text: 'Claim and verify your facility, receive requests and confirm donations at the desk with the donor’s code.' },
  { icon: ShieldCheck, title: 'Admins', text: 'Review hospital licences, keep the network trustworthy and audit every decision.' },
];
const FAQ = [
  ['Is blood bought or sold on BloodBridge?', 'No. BloodBridge only coordinates. Hospitals and blood banks handle screening, collection and issue under their own licences.'],
  ['Who can see my details as a donor?', 'Hospitals see only donor counts by blood group. After you accept a request, the family and the hospital can see your first name and phone so you can coordinate.'],
  ['Why can I only send requests to verified hospitals?', 'So donors always arrive somewhere that can receive them. A hospital becomes verified after our team reviews its licence.'],
  ['What is the 6 digit code?', 'When you accept a request you get a one-time code. The hospital enters it at the desk to confirm your donation, which then issues your certificate.'],
  ['My hospital is missing from the directory.', 'Hospitals are imported from OpenStreetMap. If yours is not there, register it from the hospital dashboard and it will appear once verified.'],
  ['How do I know a certificate is genuine?', 'Every certificate has a number. Enter it on the Verify page to confirm the donation, hospital and date.'],
];

export default function HowItWorks() {
  return (
    <>
      <PageBanner title="How It Works" text="Four roles, one network, and a clear path from request to donation." tabs={[{ id: 'roles', label: 'Who does what' }, { id: 'faq', label: 'FAQs' }]} />
      <Section id="roles">
        <SectionTitle script="One network" title="Four people who each have a job" />
        <div className="grid gap-5 sm:grid-cols-2">
          {ROLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-5 rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white"><Icon className="size-6" /></span>
              <div><h3 className="text-xl font-extrabold text-ink-700">{title}</h3><p className="mt-1.5 leading-relaxed text-ink-500">{text}</p></div>
            </div>
          ))}
        </div>
      </Section>
      <Section id="faq" tone="soft">
        <SectionTitle center script="Good to know" title="Frequently asked questions" />
        <div className="mx-auto max-w-3xl space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl bg-white p-5 shadow-card open:shadow-lg">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-ink-700">
                {q} <ChevronDown className="size-5 shrink-0 text-brand-600 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-relaxed text-ink-500">{a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
