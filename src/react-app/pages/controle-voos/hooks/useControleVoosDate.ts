import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return getToday();
}

export function useControleVoosDate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = useMemo(() => normalizeDate(searchParams.get('data')), [searchParams]);

  const setSelectedDate = (nextDate: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('data', normalizeDate(nextDate));
    setSearchParams(next, { replace: true });
  };

  const setToday = () => {
    const today = getToday();
    const next = new URLSearchParams(searchParams);
    next.set('data', today);
    setSearchParams(next, { replace: true });
  };

  return {
    selectedDate,
    setSelectedDate,
    setToday,
  };
}
