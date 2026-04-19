export type Unit =
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'months'
  | 'quarters'
  | 'years';

export type DifferenceFormat = Partial<Record<Unit, number>>;

export type DifferenceOptions = {
  units?: Unit[];
};

function calculateMonthsDifference(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12;
  months -= from.getMonth();
  months += to.getMonth();

  if (to.getDate() < from.getDate()) {
    months--;
  }

  return months <= 0 ? 0 : months;
}

export function difference(from: Date, to: Date, options?: DifferenceOptions): DifferenceFormat {
  const start = from < to ? from : to;
  const end = from < to ? to : from;

  const uniqueUnits = options?.units
    ? new Set(options.units)
    : new Set<Unit>([
        'milliseconds',
        'seconds',
        'minutes',
        'hours',
        'days',
        'weeks',
        'months',
        'quarters',
        'years',
      ]);

  const diffMs = Math.abs(end.getTime() - start.getTime());
  const result: DifferenceFormat = {};

  if (uniqueUnits.has('milliseconds')) {
    result.milliseconds = diffMs;
  }
  if (uniqueUnits.has('seconds')) {
    result.seconds = Math.floor(diffMs / 1000);
  }
  if (uniqueUnits.has('minutes')) {
    result.minutes = Math.floor(diffMs / 60000);
  }
  if (uniqueUnits.has('hours')) {
    result.hours = Math.floor(diffMs / 3600000);
  }
  if (uniqueUnits.has('days')) {
    result.days = Math.floor(diffMs / 86400000);
  }
  if (uniqueUnits.has('weeks')) {
    result.weeks = Math.floor(diffMs / 604800000);
  }

  if (uniqueUnits.has('months') || uniqueUnits.has('quarters') || uniqueUnits.has('years')) {
    const totalMonths = calculateMonthsDifference(start, end);

    if (uniqueUnits.has('months')) {
      result.months = totalMonths;
    }
    if (uniqueUnits.has('quarters')) {
      result.quarters = Math.floor(totalMonths / 3);
    }
    if (uniqueUnits.has('years')) {
      result.years = Math.floor(totalMonths / 12);
    }
  }

  return result;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const PRIORITIES: { unit: Intl.RelativeTimeFormatUnit; threshold: number }[] = [
  { unit: 'year', threshold: 31536000000 }, // ~365 days
  { unit: 'month', threshold: 2592000000 }, // ~30 days
  { unit: 'week', threshold: 604800000 }, // 7 days
  { unit: 'day', threshold: 86400000 }, // 24 hours
  { unit: 'hour', threshold: 3600000 }, // 60 mins
  { unit: 'minute', threshold: 60000 }, // 60 seconds
  { unit: 'second', threshold: 1000 }, // 1 second
];

function getRelativeString(targetDate: Date, baseDate: Date = new Date()): string {
  const diffMs = targetDate.getTime() - baseDate.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < 1000) {
    return 'Just now';
  }

  for (const { unit, threshold } of PRIORITIES) {
    if (absMs >= threshold) {
      const value = Math.round(diffMs / threshold);
      return rtf.format(value, unit);
    }
  }

  return 'Just now';
}

export function readableTimeDiff(date: Date): string {
  return getRelativeString(date, new Date());
}

export function futureTimeDiff(date: Date): string {
  return getRelativeString(date, new Date());
}
