/** Day-of-operation timing is evaluated in the Brazilian flight-base timezone. */
export function isAtOrAfterFrmsPresentation(
  submittedAt: Date,
  presentationTime: string | null | undefined,
): boolean {
  // Without a reliable presentation time, never infer a pre-presentation check-in.
  if (!Number.isFinite(submittedAt.getTime()) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(presentationTime ?? '')) {
    return true;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(submittedAt);
  const numberPart = (name: 'hour' | 'minute') => Number(parts.find((part) => part.type === name)?.value);
  const hour = numberPart('hour');
  const minute = numberPart('minute');
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return true;
  const [scheduledHour, scheduledMinute] = presentationTime!.split(':').map(Number);
  return hour * 60 + minute >= scheduledHour * 60 + scheduledMinute;
}
