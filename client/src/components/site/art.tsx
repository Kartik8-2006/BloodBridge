import { clsx } from 'clsx';

/** A band of tilted drops, our take on a harvest border. Colour comes from currentColor. */
export function DropBorder({ className }: { className?: string }) {
  return (
    <svg className={clsx('block h-14 w-full', className)} aria-hidden preserveAspectRatio="xMidYMax slice" viewBox="0 0 240 56">
      <defs>
        <pattern id="bb-drops" width="30" height="56" patternUnits="userSpaceOnUse">
          <g fill="currentColor">
            <path transform="translate(6 26) rotate(-18)" d="M8 0C5 5 1 8 1 12.5a7 7 0 0 0 14 0C15 8 11 5 8 0z" />
            <path transform="translate(18 10) rotate(14) scale(.8)" d="M8 0C5 5 1 8 1 12.5a7 7 0 0 0 14 0C15 8 11 5 8 0z" opacity=".7" />
            <path transform="translate(14 38) rotate(8) scale(.7)" d="M8 0C5 5 1 8 1 12.5a7 7 0 0 0 14 0C15 8 11 5 8 0z" opacity=".5" />
          </g>
        </pattern>
      </defs>
      <rect width="240" height="56" fill="url(#bb-drops)" />
    </svg>
  );
}

/** Original hero illustration: a drop inside concentric rings with a heartbeat line. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 520" className={clsx('h-full w-full', className)} role="img" aria-label="A blood drop with a heartbeat line">
      <defs>
        <radialGradient id="bb-g1" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#ff7a7a" />
          <stop offset=".55" stopColor="#d6303a" />
          <stop offset="1" stopColor="#8f1b20" />
        </radialGradient>
        <linearGradient id="bb-g2" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="260" cy="260" r="240" fill="#fff" opacity=".07" />
      <circle cx="260" cy="260" r="190" fill="#fff" opacity=".09" />
      <circle cx="260" cy="260" r="140" fill="#fff" opacity=".12" />
      <path d="M260 92C214 160 150 214 150 292a110 110 0 0 0 220 0c0-78-64-132-110-200z" fill="url(#bb-g1)" />
      <path d="M205 300c0 32 18 58 48 66" stroke="#fff" strokeOpacity=".55" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M60 330h120l24-52 38 104 34-76 22 24h162" stroke="url(#bb-g2)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <g fill="#f1cd6b">
        <circle cx="86" cy="116" r="7" /><circle cx="438" cy="150" r="5" /><circle cx="410" cy="420" r="8" /><circle cx="104" cy="420" r="5" />
      </g>
    </svg>
  );
}
