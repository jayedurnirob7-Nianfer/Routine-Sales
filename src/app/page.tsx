'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getEmployees, getRoster, getLeaves, isOnLeave, getActiveLeave, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress } from '@/lib/store';
import { Employee, RosterData, LeaveRecord, ShiftType } from '@/types';

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
  const [leaves, setLeaves]       = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEmp, setSelectedEmp] = useState<{ emp: Employee; date: string } | null>(null);

  const today = todayKey();

  useEffect(() => {
    Promise.all([getEmployees(), getRoster(), getLeaves()]).then(([emps, ros, lvs]) => {
      setEmployees(emps);
      setRoster(ros);
      setLeaves(lvs);
      setLoading(false);
    });
  }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

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

  function getOffEmployeesByPrevShift(date: string): Record<ShiftType, Employee[]> {
    const offToday = getShiftEmployees('off', date);
    const grouped: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const yesterday = prevDateKey(date);

    offToday.forEach(emp => {
      const yesterdayAssignment = (roster[yesterday] ?? []).find(a => a.employeeId === emp.id);
      if (yesterdayAssignment && TODAY_SHIFTS.includes(yesterdayAssignment.shift)) {
        grouped[yesterdayAssignment.shift].push(emp);
      } else {
        grouped.off.push(emp);
      }
    });
    return grouped;
  }

  const all15Days = get15Days(today);

  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => {
      const offByShift = getOffEmployeesByPrevShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => {
          const rawEmployees = getShiftEmployees(shift, date);
          const workingEmployees = rawEmployees.filter(emp => !isOnLeave(leaves, emp.employeeId, date));
          const onLeaveEmployees = rawEmployees.filter(emp => isOnLeave(leaves, emp.employeeId, date));
          
          const rawOffEmployees = offByShift[shift] || [];
          const offEmployees = rawOffEmployees.filter(emp => !isOnLeave(leaves, emp.employeeId, date));
          const offOnLeave = rawOffEmployees.filter(emp => isOnLeave(leaves, emp.employeeId, date));

          return {
            shift,
            employees: workingEmployees,
            offEmployees: offEmployees,
            onLeaveEmployees: [...onLeaveEmployees, ...offOnLeave],
          };
        }),
        unsortedOff: (offByShift.off || []).filter(emp => !isOnLeave(leaves, emp.employeeId, date)),
        unsortedLeave: (offByShift.off || []).filter(emp => isOnLeave(leaves, emp.employeeId, date)),
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-400 text-sm">Loading from Google Sheets…</p>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayOffByShift = getOffEmployeesByPrevShift(today);

  function NightProgressPopover({ employee, date }: { employee: Employee; date: string }) {
    const progress = getNightShiftProgress(roster, leaves, employee.employeeId, date);
    const displayLeave = getActiveLeave(leaves, employee.employeeId);

    const rangeLabel = progress.totalNights === 0
      ? progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `${
          progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        } – ${
          progress.rangeTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }`;

    return (
      <div
        className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold">{employee.name}</div>
          <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setSelectedEmp(null)}>✕</button>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">
          {rangeLabel} · Night Shifts
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-600">{progress.completedNights}</div>
            <div className="text-[10px] text-gray-400">Done</div>
          </div>
          <div className="text-gray-300">/</div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-400">{progress.totalNights}</div>
            <div className="text-[10px] text-gray-400">Total</div>
          </div>
          <div className="ml-auto text-center">
            <div className="text-xl font-bold text-amber-500">{progress.remainingNights}</div>
            <div className="text-[10px] text-gray-400">Left</div>
          </div>
        </div>
        {progress.totalNights > 0 && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
            <div
              className="h-full bg-purple-500"
              style={{ width: `${(progress.completedNights / progress.totalNights) * 100}%` }}
            />
          </div>
        )}
        {progress.totalNights === 0 && (
          <p className="text-[10px] text-gray-400 mt-1">No night shifts in this block.</p>
        )}
        {displayLeave && (
          <div className="mt-2 text-[10px] text-amber-500 font-medium">
            ✈️ On leave: {new Date(displayLeave.fromDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(displayLeave.toDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
    );
  }

  function EmployeeRow({ emp, muted = false, date }: { emp: Employee; muted?: boolean; date: string }) {
    const isSelected = selectedEmp?.emp.id === emp.id && selectedEmp?.date === date;
    return (
      <div
        className="relative flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg -mx-1 px-1 py-0.5"
        onClick={() => setSelectedEmp(isSelected ? null : { emp, date })}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${muted ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          {emp.name.charAt(0)}
        </div>
        <div>
          <div className={`text-sm font-medium ${muted ? 'text-gray-400' : ''}`}>{emp.name}</div>
          <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
        </div>
        {isSelected && <NightProgressPopover employee={emp} date={date} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, onLeaveEmployees = [], date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; onLeaveEmployees?: Employee[]; date: string }) {
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
                <EmployeeRow key={emp.id} emp={emp} date={date} />
              ))}
            </div>
          )}
          {offEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">🛌 Off Today</div>
              {offEmployees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} muted date={date} />
              ))}
            </div>
          )}
          {onLeaveEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold">✈️ On Leave</div>
              {onLeaveEmployees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} muted date={date} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function UnsortedOffCard({ employees, onLeaveEmployees = [], date }: { employees: Employee[]; onLeaveEmployees?: Employee[]; date: string }) {
    if (employees.length === 0 && onLeaveEmployees.length === 0) return null;
    return (
      <div className="card overflow-visible border border-dashed border-gray-300 dark:border-gray-700">
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60">
          {employees.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
                🛌 Off Day (no prior shift on record)
              </div>
              <div className="flex flex-wrap gap-3">
                {employees.map(emp => (
                  <div key={emp.id} className="relative">
                    <EmployeeRow emp={emp} muted date={date} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {onLeaveEmployees.length > 0 && (
            <div className={employees.length > 0 ? "pt-2 border-t border-gray-200 dark:border-gray-700" : ""}>
              <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold mb-2">
                ✈️ On Leave (no prior shift on record)
              </div>
              <div className="flex flex-wrap gap-3">
                {onLeaveEmployees.map(emp => (
                  <div key={emp.id} className="relative">
                    <EmployeeRow emp={emp} muted date={date} />
                  </div>
                ))}
              </div>
            </div>
          )}
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
          const rawEmployees = getShiftEmployees(shift, today);
          const workingEmployees = rawEmployees.filter(emp => !isOnLeave(leaves, emp.employeeId, today));
          const onLeaveEmployees = rawEmployees.filter(emp => isOnLeave(leaves, emp.employeeId, today));
          
          const rawOffEmployees = todayOffByShift[shift] || [];
          const offEmployees = rawOffEmployees.filter(emp => !isOnLeave(leaves, emp.employeeId, today));
          const offOnLeave = rawOffEmployees.filter(emp => isOnLeave(leaves, emp.employeeId, today));

          return (
            <ShiftCard
              key={shift}
              shift={shift}
              employees={workingEmployees}
              offEmployees={offEmployees}
              onLeaveEmployees={[...onLeaveEmployees, ...offOnLeave]}
              date={today}
            />
          );
        })}
      </div>
      <UnsortedOffCard 
        employees={(todayOffByShift.off || []).filter(e => !isOnLeave(leaves, e.employeeId, today))} 
        onLeaveEmployees={(todayOffByShift.off || []).filter(e => isOnLeave(leaves, e.employeeId, today))}
        date={today} 
      />

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees, onLeaveEmployees }) => (
                <ShiftCard
                  key={`${day.date}-${shift}`}
                  shift={shift}
                  employees={employees}
                  offEmployees={offEmployees}
                  onLeaveEmployees={onLeaveEmployees}
                  date={day.date}
                />
              ))}
            </div>
            <UnsortedOffCard employees={day.unsortedOff} onLeaveEmployees={day.unsortedLeave} date={day.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
