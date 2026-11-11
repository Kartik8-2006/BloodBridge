import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const pill = 'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-extrabold uppercase tracking-wider transition-all duration-150';
const pillTones = {
  wine: 'bg-wine-900 text-white hover:bg-black',
  red: 'bg-brand-600 text-white shadow-glow hover:bg-brand-700',
  gold: 'bg-plasma-400 text-wine-900 hover:bg-plasma-300',
  white: 'bg-white text-brand-700 hover:bg-brand-50',
  outline: 'border-2 border-plasma-400 bg-transparent text-plasma-700 hover:bg-plasma-50',
  outlineWhite: 'border-2 border-white/80 text-white hover:bg-white/10',
} as const;

export function PillLink({ to, tone = 'red', children, className }: { to: string; tone?: keyof typeof pillTones; children: ReactNode; className?: string }) {
  const cls = clsx(pill, pillTones[tone], className);
  return to.startsWith('mailto:') || to.startsWith('http') ? <a href={to} className={cls}>{children}</a> : <Link to={to} className={cls}>{children}</Link>;
}

export const Script = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={clsx('font-script text-3xl text-plasma-600 sm:text-4xl', className)}>{children}</p>
);

/** Left coloured panel + right artwork, like a poster. */
export function SplitHero({ script, title, text, actions, art, tabs }: { script: string; title: ReactNode; text: string; actions: ReactNode; art: ReactNode; tabs?: { to: string; label: string }[] }) {
  return (
    <section id="home-hero" className="scroll-mt-40 overflow-hidden">
      <div className="grid bg-brand-600 text-white lg:grid-cols-2">
        <div className="relative z-10 px-6 pb-24 pt-12 sm:px-10 sm:pb-28 sm:pt-16 lg:flex lg:h-[34rem] lg:flex-col lg:justify-center lg:px-[clamp(3rem,11vw,14rem)] lg:py-20">
          <p className="font-script text-3xl text-plasma-300 sm:text-4xl">{script}</p>
          <h1 className="mt-3 max-w-[36rem] text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl xl:text-[3.75rem]">{title}</h1>
          <p className="mt-5 max-w-[34rem] text-base font-medium leading-relaxed text-white/90 xl:text-lg">{text}</p>
          <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
        </div>
        <div className="relative hidden h-[34rem] bg-gradient-to-br from-brand-700 to-wine-900 lg:block">
          <div className="absolute inset-0 grid place-items-center p-10">{art}</div>
        </div>
      </div>
      {tabs && <nav aria-label="Explore BloodBridge" className="border-b border-ink-200 bg-white"><ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-1 px-4 sm:px-6">{tabs.map((tab) => <li key={tab.to}><Link to={tab.to} className="block px-4 py-4 text-sm font-extrabold text-plasma-700 hover:text-brand-700">{tab.label}</Link></li>)}</ul></nav>}
    </section>
  );
}

export function PageBanner({ title, text, tabs }: { title: string; text?: string; tabs?: { id: string; label: string }[] }) {
  const themes: Record<string, { eyebrow: string; image: string; panel: string; fallback: string }> = {
    'Become a Donor': { eyebrow: 'Donate blood', image: '/images/donor-hero.png', panel: 'bg-brand-700', fallback: 'Your gift can help up to three patients.' },
    'Find Blood': { eyebrow: 'Blood requests', image: '/images/hospital-hero.png', panel: 'bg-ink-600', fallback: 'Find verified help when every minute matters.' },
    'For Hospitals': { eyebrow: 'Verified care', image: '/images/hospital-hero.png', panel: 'bg-wine-900', fallback: 'Bring your hospital into a faster, safer donor network.' },
    'How It Works': { eyebrow: 'One connected network', image: '/images/community-hero.png', panel: 'bg-brand-700', fallback: 'From a request to a confirmed donation, every step is clear.' },
    'About Us': { eyebrow: 'About BloodBridge', image: '/images/community-hero.png', panel: 'bg-ink-600', fallback: 'A practical network for people who need blood and people ready to help.' },
    'Resources': { eyebrow: 'Resource centre', image: '/images/resources-hero.png', panel: 'bg-ink-600', fallback: 'Guides and answers for every step of blood donation.' },
  };
  const theme = themes[title] ?? themes['About Us'];
  return (
    <>
      <section className="grid overflow-hidden text-white lg:grid-cols-2">
        <div className={clsx('flex min-h-[22rem] items-center px-6 py-14 sm:px-12 lg:h-[34rem] lg:px-[clamp(3rem,11vw,14rem)]', theme.panel)}>
          <div className="max-w-xl">
            <p className="text-sm font-black uppercase tracking-[.16em] text-white/90 sm:text-base">{theme.eyebrow}</p>
            <h1 className="mt-4 text-5xl font-black leading-[.94] tracking-tight sm:text-6xl xl:text-7xl">{title}</h1>
            <p className="mt-7 max-w-lg text-lg font-semibold leading-relaxed text-white/95 sm:text-xl">{text ?? theme.fallback}</p>
          </div>
        </div>
        <div className="relative min-h-[18rem] overflow-hidden lg:h-[34rem]">
          <img src={theme.image} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-wine-900/10" />
        </div>
      </section>
      {tabs && (
        <nav aria-label="On this page" className="sticky top-[64px] z-20 border-b border-ink-200 bg-white lg:top-[76px]">
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-1 px-4 sm:px-6">
            {tabs.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="block px-4 py-4 text-sm font-extrabold text-plasma-700 hover:text-brand-700">{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

export function Section({ id, children, className, tone = 'white' }: { id?: string; children: ReactNode; className?: string; tone?: 'white' | 'soft' }) {
  return (
    <section id={id} className={clsx('scroll-mt-40 py-16 sm:py-20', tone === 'soft' ? 'bg-ink-50' : 'bg-white', className)}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionTitle({ script, title, text, center }: { script?: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={clsx('mb-10', center && 'text-center')}>
      {script && <Script>{script}</Script>}
      <h2 className="text-3xl font-extrabold tracking-tight text-ink-700 sm:text-4xl">{title}</h2>
      {text && <p className={clsx('mt-3 max-w-2xl text-lg leading-relaxed text-ink-500', center && 'mx-auto')}>{text}</p>}
    </div>
  );
}

const factTones = { gold: 'bg-plasma-600', red: 'bg-brand-600', wine: 'bg-wine-900' } as const;
export function FactPanel({ tone, value, label, note }: { tone: keyof typeof factTones; value: ReactNode; label: string; note: string }) {
  return (
    <div className={clsx('relative flex min-h-72 flex-col items-center justify-center overflow-hidden px-8 py-12 text-center text-white', factTones[tone])}>
      <span className="mb-6 flex size-14 items-center justify-center rounded-full border-2 border-white/80"><Star className="size-6 fill-white" /></span>
      <p className="text-5xl font-black tracking-tight sm:text-6xl">{value}</p>
      <p className="mt-3 text-xl font-bold leading-snug">{label}</p>
      <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-white/80">{note}</p>
    </div>
  );
}

export function FeatureCard({ to, title, text, art, cta = 'Learn more' }: { to: string; title: string; text: string; art: ReactNode; cta?: string }) {
  return (
    <Link to={to} className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-ink-100 bg-white shadow-card transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative grid h-56 place-items-center overflow-hidden">{art}</div>
      <div className="flex flex-1 flex-col items-center bg-ink-50 px-6 py-7 text-center">
        <h3 className="text-2xl font-extrabold text-ink-600">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{text}</p>
        <span className="mt-5 text-sm font-extrabold uppercase tracking-wider text-plasma-600 group-hover:text-brand-700">{cta}</span>
      </div>
    </Link>
  );
}
