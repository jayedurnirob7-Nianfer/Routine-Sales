import { SHIFT_INFO } from '@/lib/store';
import { ShiftType } from '@/types';

export default function ShiftBadge({ shift, size = 'sm', isLeave = false }: { shift: ShiftType; size?: 'sm' | 'md', isLeave?: boolean }) {
  if (isLeave) {
    return (
      <span className={`badge bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-500 ${size === 'md' ? 'text-sm px-3 py-1' : ''}`}>
        ✈️ Leave
      </span>
    );
  }

  const s = SHIFT_INFO[shift];
  return (
    <span className={`badge ${s.bg} ${s.color} border ${s.border} ${size === 'md' ? 'text-sm px-3 py-1' : ''}`}>
      {s.label}
    </span>
  );
}
