'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, getRoster, saveRoster, saveEmployees, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress, invalidateCache, getAssignment, upsertAssignment } from '@/lib/store';
import { Employee, RosterData, ShiftType, ShiftRequest } from '@/types';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

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

// Unique key for identifying a specific popover location
interface PopoverTarget {
  empId: string;
  date: string;
  shift: ShiftType;
}

function Avatar({ emp, className = '' }: { emp: Employee, className?: string }) {
  if (emp.profileImage) {
    return <img src={emp.profileImage} alt={emp.name} className={`object-cover ${className}`} />;
  }
  return <div className={`flex items-center justify-center font-bold ${className}`}>{emp.name.charAt(0)}</div>;
}

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<PopoverTarget | null>(null);
  const { employeeUser } = useAuth();
  const today = todayKey();

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    if (forceRefresh) invalidateCache();
    try {
      const [emps, ros] = await Promise.all([getEmployees(), getRoster()]);
      setEmployees(emps);
      setRoster(ros);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Failed to load from Google Sheets: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBackground = useCallback(async () => {
    try {
      invalidateCache();
      const [emps, ros] = await Promise.all([getEmployees(), getRoster()]);
      setEmployees(emps);
      setRoster(ros);
    } catch (e) {
      // Silent fail for background poll
    }
  }, []);

  useEffect(() => { 
    load(true); // Always fetch fresh data on initial dashboard mount
    
    // Poll for new requests silently every 30 seconds
    const interval = setInterval(loadBackground, 30000);
    return () => clearInterval(interval);
  }, [load, loadBackground]);

  const allPendingRequests = employees.flatMap(emp => {
    if (!emp.requests) return [];
    return Object.values(emp.requests).filter(r => r.status === 'pending').map(r => ({ emp, req: r }));
  });


  async function handleApprove(emp: Employee, req: ShiftRequest) {
    const isLeave = req.type === 'leave';
    
    if (req.type !== 'issue') {
      const newRoster = await upsertAssignment(roster, req.date, {
        employeeId: emp.id,
        shift: (req.type === 'off' || isLeave) ? 'off' : (req.requestedShift || 'morning'),
        effectiveFrom: req.date,
        effectiveTo: req.date,
        isOffDayOverride: true,
        reason: isLeave ? `LEAVE|${req.date}|${req.date}|${req.reason || 'Leave'}` : `Approved Request: ${req.type}`,
      });
      setRoster(newRoster);
    }

    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'approved' };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
  }

  async function handleReject(emp: Employee, req: ShiftRequest) {
    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'rejected' };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
  }

  async function handleDeleteRequest(emp: Employee, req: ShiftRequest) {
    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      delete e.requests[req.date];
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  useEffect(() => {
    function handleClickOutside() {
      setPopoverTarget(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    const shiftEmpIds = (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => a.employeeId);
    
    // Return employees strictly in their global priority order
    return employees.filter(e => shiftEmpIds.includes(e.id) || shiftEmpIds.includes(e.employeeId));
  }

  function prevDateKeyN(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d - n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function moveEmployee(shift: ShiftType, date: string, empId: string, direction: 'up' | 'down') {
    const shiftEmployees = getShiftEmployees(shift, date);
    const shiftIndex = shiftEmployees.findIndex(e => e.id === empId);
    if (shiftIndex === -1) return;

    let swapEmpId: string | null = null;
    if (direction === 'up' && shiftIndex > 0) {
      swapEmpId = shiftEmployees[shiftIndex - 1].id;
    } else if (direction === 'down' && shiftIndex < shiftEmployees.length - 1) {
      swapEmpId = shiftEmployees[shiftIndex + 1].id;
    }

    if (swapEmpId) {
      const newEmployees = [...employees];
      const idx1 = newEmployees.findIndex(e => e.id === empId);
      const idx2 = newEmployees.findIndex(e => e.id === swapEmpId!);

      if (idx1 !== -1 && idx2 !== -1) {
        const temp = newEmployees[idx1];
        newEmployees[idx1] = newEmployees[idx2];
        newEmployees[idx2] = temp;

        setEmployees(newEmployees);
        saveEmployees(newEmployees); // Persists global order to backend
      }
    }
  }

  // ✅ Intelligently routes Off days by looking up to 7 days in the past (Fixes Nahid's issue!)
  function getOffEmployeesByPrevShift(date: string) {
    const offToday = getShiftEmployees('off', date);
    const groupedOff: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const groupedLeave: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const unsortedOff: Employee[] = [];
    const unsortedLeave: Employee[] = [];

    offToday.forEach(emp => {
      const assignment = getAssignment(roster, emp, date);
      const isLeave = assignment?.reason?.startsWith('LEAVE|');

      let prevShift: ShiftType | null = null;
      // Look back up to 7 days to find their last real working shift (skips leaves and off days!)
      for (let i = 1; i <= 7; i++) {
        const pastDate = prevDateKeyN(date, i);
        const pastAssignment = getAssignment(roster, emp, pastDate);
        if (pastAssignment && TODAY_SHIFTS.includes(pastAssignment.shift)) {
          prevShift = pastAssignment.shift;
          break;
        }
      }

      if (!prevShift) {
        prevShift = emp.defaultShift ?? 'morning';
      }

      if (TODAY_SHIFTS.includes(prevShift)) {
        if (isLeave) {
          groupedLeave[prevShift].push(emp);
        } else {
          groupedOff[prevShift].push(emp);
        }
      } else {
        if (isLeave) {
          unsortedLeave.push(emp);
        } else {
          unsortedOff.push(emp);
        }
      }
    });
    return { groupedOff, groupedLeave, unsortedOff, unsortedLeave };
  }

  const all15Days = get15Days(today);

  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => {
      const { groupedOff, groupedLeave, unsortedOff, unsortedLeave } = getOffEmployeesByPrevShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => ({
          shift,
          employees: getShiftEmployees(shift, date),
          offEmployees: groupedOff[shift],
          leaveEmployees: groupedLeave[shift],
        })),
        unsortedLeave,
        unsortedOff,
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-500 font-medium">Could not load data</p>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={() => load(true)} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayData = getOffEmployeesByPrevShift(today);

  function isPopoverOpen(empId: string, date: string, shift: ShiftType): boolean {
    if (!popoverTarget) return false;
    return popoverTarget.empId === empId && popoverTarget.date === date && popoverTarget.shift === shift;
  }

  function togglePopover(empId: string, date: string, shift: ShiftType) {
    if (isPopoverOpen(empId, date, shift)) {
      setPopoverTarget(null);
    } else {
      setPopoverTarget({ empId, date, shift });
    }
  }

  function NightProgressPopover({ employee }: { employee: Employee }) {
    const progress = getNightShiftProgress(roster, employee, today);
    return (
      <div
        className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold">{employee.name}</div>
          <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setPopoverTarget(null)}>✕</button>
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
          {progress.remaining > 0 && (
            <div className="ml-auto text-center">
              <div className="text-xl font-bold text-amber-500">{progress.remaining}</div>
              <div className="text-[10px] text-gray-400">Left</div>
            </div>
          )}
        </div>
        {progress.total > 0 && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
            <div className="h-full bg-purple-500" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
          </div>
        )}
        {progress.total === 0 && <p className="text-[10px] text-gray-400 mt-1">No night shifts this month.</p>}

        <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button 
            className="w-full btn-secondary py-1.5 text-xs flex items-center justify-center gap-1 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => router.push(`/employees?id=${employee.id}`)}
          >
            <span>👤</span> Go to Profile
          </button>
        </div>
      </div>
    );
  }

  function EmployeeRow({ emp, date, shift, muted = false, isFirst, isLast, onMoveUp, onMoveDown }: { emp: Employee; date: string; shift: ShiftType; muted?: boolean; isFirst?: boolean; isLast?: boolean; onMoveUp?: () => void; onMoveDown?: () => void }) {
    const showPopover = isPopoverOpen(emp.id, date, shift);
    const progress = shift === 'night' ? getNightShiftProgress(roster, emp, today) : null; 

    return (
      <div
        className={`relative flex items-center gap-2 cursor-pointer rounded-lg px-1 py-0.5 ${muted ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40 -mx-1'}`}
        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); togglePopover(emp.id, date, shift); }}>
        <div className={`w-7 h-7 rounded-full shrink-0 overflow-hidden shadow-sm border border-gray-200/50 dark:border-gray-700/50
          ${muted ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          <Avatar emp={emp} className="w-full h-full text-xs" />
        </div>
        <div>
          <div className={`text-sm font-medium flex items-center gap-2 ${muted ? 'text-gray-500 dark:text-gray-400' : ''}`}>
             {emp.name}
             {shift === 'night' && date === today && progress && progress.total > 0 && (
                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold dark:bg-purple-900/40 dark:text-purple-300">
                   {progress.completed}/{progress.total}
                </span>
             )}
          </div>
          <div className={`text-xs ${muted ? 'text-gray-400/80 dark:text-gray-500' : 'text-gray-400'}`}>{emp.employeeId} · {emp.role.split('|IMG:')[0]}</div>
        </div>
        {isAdmin && !muted && onMoveUp && onMoveDown && (
          <div className="flex flex-col gap-0 ml-auto z-10" onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
            <button onClick={onMoveUp} disabled={isFirst} className="text-gray-300 hover:text-teal-500 disabled:opacity-20 px-2 py-0.5 leading-none text-xs" title="Move Up">▲</button>
            <button onClick={onMoveDown} disabled={isLast} className="text-gray-300 hover:text-teal-500 disabled:opacity-20 px-2 py-0.5 leading-none text-xs" title="Move Down">▼</button>
          </div>
        )}
        {showPopover && <NightProgressPopover employee={emp} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, leaveEmployees, date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; leaveEmployees: Employee[]; date: string }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible flex flex-col h-full">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white rounded-t-2xl shrink-0`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
              <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
            </div>
            <div className="text-3xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 flex-1 h-full flex flex-col justify-between">
          <div className="space-y-2 mb-4">
            {employees.length === 0 ? (
              <p className="text-gray-400 text-sm">No one assigned</p>
            ) : (
              employees.map((emp, idx) => (
                <EmployeeRow 
                  key={emp.id} emp={emp} date={date} shift={shift} 
                  isFirst={idx === 0} 
                  isLast={idx === employees.length - 1}
                  onMoveUp={() => moveEmployee(shift, date, emp.id, 'up')}
                  onMoveDown={() => moveEmployee(shift, date, emp.id, 'down')}
                />
              ))
            )}
          </div>

          {(offEmployees.length > 0 || leaveEmployees.length > 0) && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
              {offEmployees.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
                    {date === today ? '🛌 Off Today' : '🛌 Off Day'}
                  </div>
                  {offEmployees.map(emp => (
                    // ✅ NEW BEAUTIFUL OFF-DAY STYLING
                    <div key={emp.id} className="bg-gray-50/80 dark:bg-gray-800/40 p-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <EmployeeRow emp={emp} date={date} shift={shift} muted />
                    </div>
                  ))}
                </div>
              )}
              {leaveEmployees.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold mb-2">
                    ✈️ On Leave
                  </div>
                  {leaveEmployees.map(emp => {
                     const assignment = getAssignment(roster, emp, date);
                     const reason = assignment?.reason?.split('|')[3] || 'Leave';
                     return (
                       <div key={emp.id} className="bg-amber-50/50 dark:bg-amber-900/10 p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50 flex flex-col hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
                         <EmployeeRow emp={emp} date={date} shift={shift} muted />
                         <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-10 pb-0.5 -mt-1 font-medium">{reason}</span>
                       </div>
                     );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function OtherOffCard({ employees, date }: { employees: Employee[]; date: string }) {
    if (employees.length === 0) return null;
    return (
      <div className="card mt-4 overflow-hidden border-none shadow-sm bg-gray-50 dark:bg-gray-800/40">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-bold flex items-center gap-2">
              <span className="text-lg">🛌</span> Off Day (No Prior Shift)
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-gray-200 dark:border-gray-700 md:pl-4">
            {employees.map(emp => (
               <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                    <Avatar emp={emp} className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500" />
                 </div>
                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{emp.name}</span>
               </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function LeaveCard({ employees, date }: { employees: Employee[]; date: string }) {
    if (employees.length === 0) return null;
    return (
      <div className="card mt-4 overflow-hidden border-none shadow-sm bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-500 font-bold flex items-center gap-2">
              <span className="text-lg">✈️</span> On Leave
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-amber-200 dark:border-amber-900/50 md:pl-4">
            {employees.map(emp => {
               const assignment = getAssignment(roster, emp, date);
               const reason = assignment?.reason?.split('|')[3] || 'Leave';
               return (
                 <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                   <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                      <Avatar emp={emp} className="w-full h-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-bold text-amber-600" />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{emp.name}</span>
                     <span className="text-[10px] text-amber-600 dark:text-amber-500">{reason}</span>
                   </div>
                 </div>
               );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-3">
            Dashboard <span className="text-sm font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-400 px-2 py-0.5 rounded-full mt-1">v2.2</span>
          </h1>
          <p className="text-gray-500 mt-2 font-medium">
            {new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — Today's Overview
          </p>
        </div>
        <button
          className="btn-ghost text-xs border border-gray-200 dark:border-gray-700"
          onClick={() => load(true)}
          title="Refresh from Google Sheets">
          ↻ Refresh
        </button>
      </div>

      {isAdmin && allPendingRequests.length > 0 && (
        <div className="card p-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700">
          <h2 className="font-bold text-yellow-800 dark:text-yellow-400 mb-3 flex items-center gap-2">
            <span>⚠️</span> Pending Requests ({allPendingRequests.length})
          </h2>
          <div className="space-y-2">
            {allPendingRequests.map(({ emp, req }) => (
              <div key={`${emp.id}-${req.date}`} className={`bg-white dark:bg-gray-800 p-3 rounded-xl flex items-center justify-between border ${req.type === 'issue' ? 'border-red-200 dark:border-red-900/50' : 'border-yellow-200 dark:border-yellow-800/50'}`}>
                <div className="flex items-center gap-3">
                  <Avatar emp={emp} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${req.type === 'issue' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`} />
                  <div>
                    <div className="text-sm font-semibold">{emp.name}</div>
                    <div className="text-xs text-gray-500">
                      {req.type === 'issue' ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="text-red-800 dark:text-red-400 font-medium">Reported Issue for <strong>{req.date}</strong></div>
                          {req.reason && (
                            <details className="group">
                              <summary className="text-xs font-bold text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-300 cursor-pointer select-none transition-colors">
                                Read Full Issue...
                              </summary>
                              <div className="mt-2 p-3 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-gray-700 dark:text-gray-300 italic whitespace-pre-wrap leading-relaxed shadow-inner">
                                {req.reason}
                              </div>
                            </details>
                          )}
                        </div>
                      ) : (
                        <>Requested <strong>{req.type === 'leave' ? `Leave${req.reason ? ` (${req.reason})` : ''}` : req.type === 'off' ? 'Off Day' : (SHIFT_INFO[req.requestedShift!]?.label || '') + ' Shift'}</strong> for <strong>{req.date}</strong></>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-primary py-1 px-3 text-xs" onClick={() => handleApprove(emp, req)}>
                    {req.type === 'issue' ? '✓ Mark Resolved' : 'Approve'}
                  </button>
                  {req.type !== 'issue' && (
                    <button className="btn-secondary py-1 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleReject(emp, req)}>Reject</button>
                  )}
                  <button className="btn-ghost py-1 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" onClick={() => handleDeleteRequest(emp, req)} title="Delete Request">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TODAY_SHIFTS.map(shift => (
            <ShiftCard
              key={shift}
              shift={shift}
              employees={getShiftEmployees(shift)}
              offEmployees={todayData.groupedOff[shift]}
              leaveEmployees={todayData.groupedLeave[shift]}
              date={today}
            />
          ))}
        </div>
        <LeaveCard employees={todayData.unsortedLeave} date={today} />
        <OtherOffCard employees={todayData.unsortedOff} date={today} />
      </div>

      <div className="space-y-8 mt-12">
        <h2 className="text-lg font-semibold border-b border-gray-200 dark:border-gray-800 pb-2">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3 bg-gray-50/50 dark:bg-gray-900/20 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              📅 {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees, leaveEmployees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees} offEmployees={offEmployees} leaveEmployees={leaveEmployees} date={day.date} />
              ))}
            </div>
            <LeaveCard employees={day.unsortedLeave} date={day.date} />
            <OtherOffCard employees={day.unsortedOff} date={day.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
