'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getEmployees, getRoster, SHIFT_INFO, todayKey, formatDate, get15Days } from '@/lib/store';
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

  function getOffEmployees(date: string = today): Employee[] {
    return getShiftEmployees('off', date);
  }

  const all15Days = get15Days(today);

  // Group shifts by day for the next 14 days (excluding today, which has its own section above)
  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => ({
      date,
      shifts: TODAY_SHIFTS.map(shift => ({
        shift,
        employees: getShiftEmployees(shift, date),
      })),
      offEmployees: getOffEmployees(date),
    }));
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
  const todayOffEmployees = getOffEmployees();

  function ShiftCard({ shift, employees }: { shift: ShiftType; employees: Employee[] }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-hidden">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
              <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
            </div>
            <div className="text-3xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-4">
          {employees.length === 0 ? (
            <p className="text-gray-400 text-sm">No one assigned</p>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function OffDayCard({ employees }: { employees: Employee[] }) {
    if (employees.length === 0) return null;
    return (
      <div className="card overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className={`bg-gradient-to-r ${shiftColors.off} p-3 text-white`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium opacity-90">{shiftIcons.off} Off Day</div>
            <div className="text-2xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap gap-3">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  {emp.name.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{emp.name}</div>
                  <div className="text-[10px] text-gray-400">{emp.employeeId} · {emp.role}</div>
                </div>
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
          <ShiftCard key={shift} shift={shift} employees={getShiftEmployees(shift)} />
        ))}
      </div>
      <OffDayCard employees={todayOffEmployees} />

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees} />
              ))}
            </div>
            <OffDayCard employees={day.offEmployees} />
          </div>
        ))}
      </div>
    </div>
  );
}
