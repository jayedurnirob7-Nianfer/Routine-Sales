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
  const [upcomingTab, setUpcomingTab] = useState<ShiftType>('morning');
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
  const activeCount      = employees.filter(e => e.active).length;

  function getShiftEmployees(shift: ShiftType): Employee[] {
    return todayAssignments
      .filter(a => a.shift === shift)
      .map(a => empMap[a.employeeId])
      .filter(Boolean) as Employee[];
  }

  const next14 = get15Days(today).slice(1);

  function getUpcomingByDay(shift: ShiftType) {
    return next14
      .map(date => ({
        date,
        employees: (roster[date] ?? [])
          .filter(a => a.shift === shift)
          .map(a => empMap[a.employeeId])
          .filter(Boolean) as Employee[],
      }))
      .filter(x => x.employees.length > 0);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{formatDate(today)} — Today's Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TODAY_SHIFTS.map(shift => {
          const info = SHIFT_INFO[shift];
          const emps = getShiftEmployees(shift);
          return (
            <div key={shift} className="card overflow-hidden">
              <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
                    <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
                  </div>
                  <div className="text-3xl font-bold">{emps.length}</div>
                </div>
              </div>
              <div className="p-4">
                {emps.length === 0 ? (
                  <p className="text-gray-400 text-sm">No one assigned</p>
                ) : (
                  <div className="space-y-2">
                    {emps.map(emp => (
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
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => router.push('/employees')}
          className="card p-4 flex items-center gap-3 hover:border-teal-400 hover:shadow-md transition-all text-left group">
          <span className="text-2xl">👥</span>
          <div>
            <div className="text-xl font-bold group-hover:text-teal-600 transition-colors">{activeCount}</div>
            <div className="text-xs text-gray-500 group-hover:text-teal-500 transition-colors">Active Employees →</div>
          </div>
        </button>

        {([
          { label: 'On Morning Today', value: getShiftEmployees('morning').length, icon: '🌅' },
          { label: 'On Evening Today', value: getShiftEmployees('evening').length, icon: '🌆' },
          { label: 'On Night Today',   value: getShiftEmployees('night').length,   icon: '🌙' },
        ] as const).map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming Shifts (Next 14 Days)</h2>
        <div className="flex gap-2 mb-4">
          {TODAY_SHIFTS.map(shift => {
            const info = SHIFT_INFO[shift];
            return (
              <button key={shift} onClick={() => setUpcomingTab(shift)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border
                  ${upcomingTab === shift
                    ? `${info.bg} ${info.color} ${info.border}`
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                {shiftIcons[shift]} {info.label}
              </button>
            );
          })}
        </div>

        {(() => {
          const upcoming = getUpcomingByDay(upcomingTab);
          const info     = SHIFT_INFO[upcomingTab];
          if (upcoming.length === 0) {
            return (
              <div className="card p-8 text-center text-gray-400">
                No upcoming {info.label} shifts in the next 14 days.
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {upcoming.map(u => (
                <div key={u.date} className={`card overflow-hidden border ${info.border}`}>
                  <div className={`${info.bg} px-4 py-2.5 border-b ${info.border}`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${info.color}`}>
                      {new Date(u.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
                    </div>
                    <div className={`text-base font-bold ${info.color}`}>
                      {new Date(u.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {u.employees.map(emp => (
                      <div key={emp.id} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${info.bg} ${info.color}`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{emp.name}</div>
                          <div className="text-xs text-gray-400 truncate">{emp.employeeId}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
