import { clsx } from 'clsx';
import { useState } from 'react';
import { BLOOD_GROUPS, bloodLabel, canGiveTo, canReceiveFrom } from '../lib/blood';
import type { BloodGroup } from '../lib/types';

function Chips({ groups, active }: { groups: BloodGroup[]; active: BloodGroup }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {BLOOD_GROUPS.map((g) => {
        const on = groups.includes(g);
        return (
          <li
            key={g}
            className={clsx(
              'flex h-10 min-w-[3.25rem] items-center justify-center rounded-xl px-3 text-sm font-extrabold transition-colors duration-200',
              on ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400',
              g === active && on && 'ring-2 ring-brand-300 ring-offset-2',
            )}
            aria-label={`${bloodLabel(g)} ${on ? 'compatible' : 'not compatible'}`}
          >
            {bloodLabel(g)}
          </li>
        );
      })}
    </ul>
  );
}

/** Interactive red-cell compatibility chart: pick a group and see who it can help and who can help it. */
export function CompatibilityExplorer() {
  const [group, setGroup] = useState<BloodGroup>('O_NEG');
  return (
    <div className="hero-drop rounded-[2rem] border border-ink-100 bg-white p-6 shadow-card sm:p-8">
      <h2 className="text-lg font-extrabold text-ink-900">Who can your blood help?</h2>
      <p className="mt-1 text-sm text-ink-500">Choose a blood group to see red-cell compatibility.</p>

      <div role="radiogroup" aria-label="Blood group" className="mt-5 grid grid-cols-4 gap-2">
        {BLOOD_GROUPS.map((g) => (
          <button
            key={g}
            role="radio"
            aria-checked={g === group}
            onClick={() => setGroup(g)}
            className={clsx(
              'h-12 cursor-pointer rounded-2xl text-base font-extrabold transition',
              g === group ? 'bg-brand-700 text-white shadow-glow' : 'bg-ink-100 text-ink-800 hover:bg-ink-200',
            )}
          >
            {bloodLabel(g)}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-5" aria-live="polite">
        <div>
          <p className="mb-2 text-sm font-bold text-ink-700">{bloodLabel(group)} can donate to</p>
          <Chips groups={canGiveTo(group)} active={group} />
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-ink-700">{bloodLabel(group)} can receive from</p>
          <Chips groups={canReceiveFrom(group)} active={group} />
        </div>
      </div>
    </div>
  );
}
