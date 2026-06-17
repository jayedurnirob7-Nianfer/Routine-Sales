'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getEmployees, getRoster, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';

const TODAY_SHIFTS: ShiftType[] = ['morning', 'evening', 'night'];

const shiftColors: Record<string, string> = {
  morning: 'from-amber-400 to-orange-400',
  evening: 'from-blue-400 to-cyan-400',
  night:   'from-purple-500 to-indigo-500',
  off:     'from-gray-300 to-gray-400',
};
const shiftIcons: Record<string, string> = {
  morning: '🌅', evening: '🌆', night: '🌙', off: '🛌',
};

export default function DashboardPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const today = todayKey();

  useEffect(() => {
    Promise.all([getEmployees(), getRoster()]).then(([emps, ros]) => {
      setEmployees(emps);
      setRoster(ros);
      setLoading(false);
    });
  }, []);

  const empMap           = Object.fromEntries(employees.map(e => [e.id, e]));
  const todayAssignments = roster[today] ?? [];

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    return (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => empMap[a.employeeId])
      .filter(Boolean) as Employee[];
  }

  function prevDateKey(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  // For a given date, find everyone off that day and bucket them under
  // the shift card matching their assignment the day before. If
  // yesterday was also off (or no record), they land in an "unsorted"
  // bucket which we render under Morning, clearly labeled.
  function getOffEmployeesByPrevShift(date: string): Record<ShiftType, Employee[]> {
    const offToday = getShiftEmployees('off', date);
    const grouped: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const yesterday = prevDateKey(date);

    offToday.forEach(emp => {
      const yesterdayAssignment = (roster[yesterday] ?? []).find(a => a.employeeId === emp.id);
      if (yesterdayAssignment && TODAY_SHIFTS.includes(yesterdayAssignment.shift)) {
        grouped[yesterdayAssignment.shift].push(emp);
      } else {
        // No usable prior-day shift (back-to-back off days, or no data) — unsorted.
        grouped.off.push(emp);
      }
    });
    return grouped;
  }

  const all15Days = get15Days(today);

  // Group shifts by day for the next 14 days (excluding today, which has its own section above)
  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => {
      const offByShift = getOffEmployeesByPrevShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => ({
          shift,
          employees: getShiftEmployees(shift, date),
          offEmployees: offByShift[shift],
        })),
        unsortedOff: offByShift.off,
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin text-4xl">⟳</div>
          <p className="text-gray-400 text-sm">Loading from Google Sheets…</p>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayOffByShift = getOffEmployeesByPrevShift(today);

  function NightProgressPopover({ employee }: { employee: Employee }) {
    const progress = getNightShiftProgress(roster, employee.id, today);
    return (
      <div
        className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold">{employee.name}</div>
          <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setSelectedEmp(null)}>✕</button>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">
          {new Date(progress.year, progress.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Night Shifts
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-600">{progress.completed}</div>
            <div className="text-[10px] text-gray-400">Done</div>
          </div>
          <div className="text-gray-300">/</div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-400">{progress.total}</div>
            <div className="text-[10px] text-gray-400">Total</div>
          </div>
          <div className="ml-auto text-center">
            <div className="text-xl font-bold text-amber-500">{progress.remaining}</div>
            <div className="text-[10px] text-gray-400">Left</div>
          </div>
        </div>
        {progress.total > 0 && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
            <div className="h-full bg-purple-500" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
          </div>
        )}
        {progress.total === 0 && <p className="text-[10px] text-gray-400 mt-1">No night shifts this month.</p>}
      </div>
    );
  }

  function EmployeeRow({ emp, muted = false }: { emp: Employee; muted?: boolean }) {
    const isSelected = selectedEmp?.id === emp.id;
    return (
      <div
        className="relative flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg -mx-1 px-1 py-0.5"
        onClick={() => setSelectedEmp(isSelected ? null : emp)}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${muted ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          {emp.name.charAt(0)}
        </div>
        <div>
          <div className={`text-sm font-medium ${muted ? 'text-gray-400' : ''}`}>{emp.name}</div>
          <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
        </div>
        {isSelected && <NightProgressPopover employee={emp} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[] }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
              <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
            </div>
            <div className="text-3xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {employees.length === 0 ? (
            <p className="text-gray-400 text-sm">No one assigned</p>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} />
              ))}
            </div>
          )}

          {offEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">🛌 Off Today</div>
              {offEmployees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} muted />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function UnsortedOffCard({ employees }: { employees: Employee[] }) {
    if (employees.length === 0) return null;
    return (
      <div className="card overflow-visible border border-dashed border-gray-300 dark:border-gray-700">
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            🛌 Off Day (no prior shift on record)
          </div>
          <div className="flex flex-wrap gap-3">
            {employees.map(emp => (
              <div key={emp.id} className="relative">
                <EmployeeRow emp={emp} muted />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{formatDate(today)} — Today's Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TODAY_SHIFTS.map(shift => (
          <ShiftCard
            key={shift}
            shift={shift}
            employees={getShiftEmployees(shift)}
            offEmployees={todayOffByShift[shift]}
          />
        ))}
      </div>
      <UnsortedOffCard employees={todayOffByShift.off} />

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees} offEmployees={offEmployees} />
              ))}
            </div>
            <UnsortedOffCard employees={day.unsortedOff} />
          </div>
        ))}
      </div>
    </div>
  );
}
