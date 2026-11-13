import dayjs from 'dayjs';
import { timeHourMinute } from '../../../utils/time';
import { sendDay } from './scheduleTime';

/** "today at 8:00 AM", "tomorrow at 13:00", "Friday at 8:00 AM", "Mon 25 Nov at 8:00 AM". */
export const sendTimeText = (ts: number, hour24Clock: boolean, now = Date.now()): string => {
  const time = timeHourMinute(ts, hour24Clock);
  switch (sendDay(ts, now)) {
    case 'today':
      return `today at ${time}`;
    case 'tomorrow':
      return `tomorrow at ${time}`;
    case 'thisWeek':
      return `${dayjs(ts).format('dddd')} at ${time}`;
    default:
      return `${dayjs(ts).format(
        dayjs(ts).year() === dayjs(now).year() ? 'ddd D MMM' : 'ddd D MMM YYYY'
      )} at ${time}`;
  }
};

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "7 days", "1 day", "12 hours", "30 minutes": the server's limit, rounded down. */
export const maxDelayText = (ms: number): string => {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return hours === 1 ? '1 hour' : `${hours} hours`;
  const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};
