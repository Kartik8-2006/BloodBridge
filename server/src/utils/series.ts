/** Helpers that turn raw timestamps into chart-ready series. */

export type Series = { label: string; value: number }[];

const DAY = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Last 7 days, oldest first, one bucket per day. */
export function lastSevenDays(dates: Date[]): Series {
  const today = startOfDay(new Date());
  const buckets: Series = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY);
    buckets.push({ label: DAY_NAMES[day.getDay()] ?? '', value: 0 });
  }
  for (const d of dates) {
    const diff = Math.floor((today.getTime() - startOfDay(d).getTime()) / DAY);
    if (diff >= 0 && diff <= 6) {
      const bucket = buckets[6 - diff];
      if (bucket) bucket.value++;
    }
  }
  return buckets;
}

/** Last 6 calendar months, oldest first. */
export function lastSixMonths(dates: Date[]): Series {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_NAMES[d.getMonth()] ?? '', value: 0 });
  }
  for (const d of dates) {
    const b = buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

export function sixMonthsAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 5, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
