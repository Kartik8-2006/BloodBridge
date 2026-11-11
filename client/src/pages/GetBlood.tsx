import { CompatibilityExplorer } from '../components/CompatibilityExplorer';
import { PageBanner, PillLink, Section, SectionTitle } from '../components/site/parts';

const STEPS = [
  ['Find a verified hospital', 'Search real hospitals and blood banks near the patient. Verified ones can receive requests.'],
  ['Create the request', 'Enter the patient name, blood group, units, how urgent it is and when it is needed by.'],
  ['We alert matching donors', 'Compatible, eligible donors nearby are alerted at once. Not enough replies? Widen the search with one tap.'],
  ['Track who is on the way', 'See donors accept in real time. The hospital confirms each donation at its desk with the donor’s code.'],
];

export default function GetBlood() {
  return (
    <>
      <PageBanner title="Find Blood" text="Reach the right donors and the right hospital without hours of phone calls." tabs={[{ id: 'request', label: 'How to request' }, { id: 'compatibility', label: 'Blood compatibility' }]} />
      <Section id="request">
        <SectionTitle script="When every minute counts" title="How to request blood" />
        <ol className="grid gap-5 md:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-5 rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-plasma-600 text-xl font-black text-white">{i + 1}</span>
              <div><h3 className="text-lg font-extrabold text-ink-700">{t}</h3><p className="mt-1 leading-relaxed text-ink-500">{d}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <PillLink to="/sign-up" tone="red">Request blood</PillLink>
          <PillLink to="/hospitals" tone="outline">Search hospitals</PillLink>
        </div>
        <p className="mt-6 rounded-2xl bg-plasma-50 p-5 text-sm text-ink-700"><strong>In a life-threatening emergency</strong>, call your local emergency number and go to the nearest emergency-ready hospital first. Use BloodBridge alongside, not instead.</p>
      </Section>
      <Section id="compatibility" tone="soft">
        <SectionTitle script="Know your match" title="Blood compatibility" text="Red-cell compatibility between donors and recipients. Hospitals confirm with cross-matching before any transfusion." />
        <div className="mx-auto max-w-2xl"><CompatibilityExplorer /></div>
      </Section>
    </>
  );
}
