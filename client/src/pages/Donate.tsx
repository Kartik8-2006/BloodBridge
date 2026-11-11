import { CalendarClock, Check, Droplets, HeartPulse, Scale, UserRound } from 'lucide-react';
import { PageBanner, PillLink, Section, SectionTitle } from '../components/site/parts';

const RULES = [
  { icon: UserRound, title: 'Age 18 to 65', text: 'Donors must be adults in good health.' },
  { icon: Scale, title: 'At least 45 kg', text: 'Your body needs enough blood volume to donate safely.' },
  { icon: CalendarClock, title: 'Rest between donations', text: 'At least 90 days for men and 120 days for women and others.' },
  { icon: HeartPulse, title: 'Feeling well', text: 'No recent illness, antibiotics, tattoo or piercing, surgery or transfusion, and not pregnant or nursing.' },
];
const STEPS = [
  ['Create your profile', 'Tell us your blood group, weight, date of birth and where you live. It takes about two minutes.'],
  ['Get alerts that fit you', 'We only alert you for compatible patients within reach, most urgent first. You can pause any time.'],
  ['Accept and get your code', 'Tap “I can donate”. A 6 digit code appears in your app, and the family is told you are on the way.'],
  ['Donate at the hospital', 'The hospital screens you, collects the blood and enters your code to confirm. Your certificate appears instantly.'],
];

export default function Donate() {
  return (
    <>
      <PageBanner title="Become a Donor" text="One donation can help up to three patients. Join the donors who answer when it matters." tabs={[{ id: 'eligibility', label: 'Eligibility' }, { id: 'process', label: 'Donation process' }, { id: 'privacy', label: 'Your privacy' }]} />

      <Section id="eligibility">
        <SectionTitle script="Who can donate" title="Eligibility at a glance" text="BloodBridge checks these automatically, and the hospital always does the final screening before any donation." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.75rem] border border-ink-100 bg-white p-7 shadow-card">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="size-6" /></span>
              <h3 className="mt-4 text-lg font-extrabold text-ink-700">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="process" tone="soft">
        <SectionTitle center script="Step by step" title="The donation process" />
        <ol className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-5 rounded-[1.75rem] bg-white p-6 shadow-card">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-xl font-black text-white">{i + 1}</span>
              <div><h3 className="text-lg font-extrabold text-ink-700">{t}</h3><p className="mt-1 leading-relaxed text-ink-500">{d}</p></div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="privacy">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionTitle script="You stay in control" title="Your privacy" />
            <ul className="space-y-3">
              {['Hospitals see only how many donors of each blood group are nearby, never who you are.', 'Your phone number is shared only with the family and hospital after you accept a request.', 'Pause alerts with one tap whenever you are travelling or unwell.'].map((t) => (
                <li key={t} className="flex gap-3 text-lg text-ink-600"><Check className="mt-1 size-5 shrink-0 text-emerald-600" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[2rem] bg-gradient-to-br from-brand-600 to-wine-900 p-10 text-center text-white">
            <Droplets className="mx-auto size-14" strokeWidth={1.4} />
            <h3 className="mt-4 text-2xl font-extrabold">Ready to be someone’s hero?</h3>
            <p className="mt-2 text-brand-100">Create your donor profile in two minutes.</p>
            <PillLink to="/sign-up" tone="white" className="mt-6">Join as a donor</PillLink>
          </div>
        </div>
      </Section>
    </>
  );
}
