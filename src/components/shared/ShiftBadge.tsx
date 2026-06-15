import { SHIFT_INFO } from '@/lib/store';
import { ShiftType } from '@/types';

export default function ShiftBadge({ shift, size = 'sm' }: { shift: ShiftType; size?: 'sm' | 'md' }) {
  const s = SHIFT_INFO[shift];
  return (
    <span className={`badge ${s.bg} ${s.color} border ${s.border} ${size === 'md' ? 'text-sm px-3 py-1' : ''}`}>
      {s.label}
    </span>
  );
}
