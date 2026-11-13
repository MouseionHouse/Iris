// The picker's presets and how a send time reads. No imports, so `npm test` can load it.

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** Morning and afternoon, as Gmail's schedule send sets them. */
export const MORNING_HOUR = 8;
export const AFTERNOON_HOUR = 13;

export type SchedulePresetId =
  | 'inOneHour'
  | 'tomorrowMorning'
  | 'tomorrowAfternoon'
  | 'mondayMorning';

const atHour = (base: Date, addDays: number, hour: number): number => {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

/** The presets' send times, from `now` in local time. */
export const schedulePresets = (now: number): { id: SchedulePresetId; sendTs: number }[] => {
  const today = new Date(now);
  // Monday after today: 1 to 7 days on
  const toMonday = (8 - today.getDay()) % 7 || 7;
  return [
    { id: 'inOneHour', sendTs: Math.ceil((now + HOUR) / MINUTE) * MINUTE },
    { id: 'tomorrowMorning', sendTs: atHour(today, 1, MORNING_HOUR) },
    { id: 'tomorrowAfternoon', sendTs: atHour(today, 1, AFTERNOON_HOUR) },
    { id: 'mondayMorning', sendTs: atHour(today, toMonday, MORNING_HOUR) },
  ];
};

const dayStart = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export type SendDay = 'today' | 'tomorrow' | 'thisWeek' | 'later';

/** How far off the send time's day is, in local days. */
export const sendDay = (ts: number, now: number): SendDay => {
  const days = Math.round((dayStart(ts) - dayStart(now)) / (24 * HOUR));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return 'thisWeek';
  return 'later';
};
