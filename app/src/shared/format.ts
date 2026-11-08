// 展示层格式化：只做 UI 文案，不参与业务判定。
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export function formatClock(iso: string | undefined | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hour = (date.getUTCHours() + 8) % 24;
  const minute = date.getUTCMinutes();
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatMonthDay(day: string): string {
  const [, month, date] = day.split('-');
  if (!month || !date) return day;
  return `${Number(month)}月${Number(date)}日`;
}

export function weekdayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return WEEKDAYS[date.getUTCDay()] ?? '';
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function greeting(now = new Date()): string {
  const hour = (now.getUTCHours() + 8) % 24;
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function clampText(value: string, max = 12): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
