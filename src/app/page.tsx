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

  function getDayEmployeeCount(date: string): number {
    let count = 0;
    TODAY_SHIFTS.forEach(shift => {
      count += getShiftEmployees(shift, date).length;
    });
    return count;
  }

  const all15Days = get15Days(today);

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

      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming Shifts (Next 14 Days)</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {all15Days.map(date => {
            const dayEmployeeCount = getDayEmployeeCount(date);
            const isToday = date === today;
            const morningEmps = getShiftEmployees('morning', date);
            const eveningEmps = getShiftEmployees('evening', date);
            const nightEmps = getShiftEmployees('night', date);
            
            return (
              <div key={date} className="card overflow-hidden">
                <div className="bg-gradient-to-r from-gray-600 to-gray-700 p-4 text-white">
                  <div className="text-sm font-medium">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-xs opacity-75 mt-0.5">{isToday ? 'Today' : 'Upcoming'}</div>
                  <div className="text-3xl font-bold mt-2">{dayEmployeeCount}</div>
                </div>
                <div className="p-4">
                  <div className="flex gap-3">
                    {/* Morning Shift - Large left box */}
                    <div className={`flex-1 bg-gradient-to-r ${shiftColors['morning']} p-3 rounded-lg text-white`}>
                      <div className="text-xs font-medium opacity-90 mb-1">{shiftIcons['morning']} Morning</div>
                      <div className="text-xs opacity-75 mb-2">{SHIFT_INFO['morning'].time}</div>
                      <div className="text-lg font-bold mb-2">{morningEmps.length}</div>
                      {morningEmps.length > 0 && (
                        <div className="space-y-1">
                          {morningEmps.map(emp => (
                            <div key={emp.id} className="flex items-center gap-1.5 text-white">
                              <div className="w-5 h-5 rounded-full bg-white bg-opacity-30 flex items-center justify-center text-xs font-bold shrink-0">
                                {emp.name.charAt(0)}
                              </div>
                              <div className="min-w-0 text-xs">
                                <div className="font-medium truncate">{emp.name.split(' ')[0]}…</div>
                                <div className="opacity-75 truncate">{emp.employeeId}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Evening and Night - Right column */}
                    <div className="flex flex-col gap-3 flex-1">
                      {/* Evening Shift */}
                      <div className={`bg-gradient-to-r ${shiftColors['evening']} p-3 rounded-lg text-white`}>
                        <div className="text-xs font-medium opacity-90 mb-1">{shiftIcons['evening']} Evening</div>
                        <div className="text-xs opacity-75 mb-1">{SHIFT_INFO['evening'].time}</div>
                        <div className="text-lg font-bold">{eveningEmps.length}</div>
                      </div>

                      {/* Night Shift */}
                      <div className={`bg-gradient-to-r ${shiftColors['night']} p-3 rounded-lg text-white`}>
                        <div className="text-xs font-medium opacity-90 mb-1">{shiftIcons['night']} Night</div>
                        <div className="text-xs opacity-75 mb-1">{SHIFT_INFO['night'].time}</div>
                        <div className="text-lg font-bold">{nightEmps.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
