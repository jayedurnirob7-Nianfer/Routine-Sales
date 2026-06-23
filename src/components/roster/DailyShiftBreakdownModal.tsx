'use client';
import { Employee, RosterData, ShiftType } from '@/types';
import { getAssignment, SHIFT_INFO } from '@/lib/store';

interface Props {
  date: string;
  roster: RosterData;
  employees: Employee[];
  onClose: () => void;
}

export default function DailyShiftBreakdownModal({ date, roster, employees, onClose }: Props) {
  const TODAY_SHIFTS: ShiftType[] = ['morning', 'evening', 'night'];

  function prevDateKeyN(dateStr: string, n: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d - n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function getShiftEmployees(shift: ShiftType): Employee[] {
    const shiftEmpIds = (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => a.employeeId);
    return employees.filter(e => shiftEmpIds.includes(e.id) || shiftEmpIds.includes(e.employeeId));
  }

  const offToday = getShiftEmployees('off');
  const groupedOff: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
  const groupedLeave: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
  const unsortedOff: Employee[] = [];
  const unsortedLeave: Employee[] = [];

  offToday.forEach(emp => {
    const assignment = getAssignment(roster, emp, date);
    const isLeave = assignment?.reason?.startsWith('LEAVE|');

    let prevShift: ShiftType | null = null;
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

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="card bg-white dark:bg-gray-900 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">📅</span> Shift Breakdown
          </h2>
          <button className="btn-ghost px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800" onClick={onClose}>Close</button>
        </div>
        
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6 text-center">{displayDate}</p>

        <div className="space-y-6">
          {TODAY_SHIFTS.map(shift => {
            const emps = getShiftEmployees(shift);
            const offEmps = groupedOff[shift];
            const leaveEmps = groupedLeave[shift];
            if (emps.length === 0 && offEmps.length === 0 && leaveEmps.length === 0) return null;
            
            const info = SHIFT_INFO[shift];

            return (
              <div key={shift} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className={`px-4 py-2 font-bold ${info.bg} ${info.color} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {shift === 'morning' ? '☀️' : shift === 'evening' ? '🌆' : '🌙'}
                    </span>
                    <span className="tracking-wide uppercase">{info.label} Shift</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-sm">
                    {emps.length} Assigned
                  </span>
                </div>
                <div className="p-4 bg-white dark:bg-gray-900/50">
                  {emps.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      {emps.map(e => (
                        <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-500 overflow-hidden shrink-0">
                            {e.profileImage ? <img src={e.profileImage} alt={e.name} className="w-full h-full object-cover" /> : e.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{e.name}</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider truncate">{e.role}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(offEmps.length > 0 || leaveEmps.length > 0) && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                      {offEmps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                            🛌 Off Day
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {offEmps.map(emp => (
                              <div key={emp.id} className="bg-gray-50/80 dark:bg-gray-800/40 pl-1 pr-3 py-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                   {emp.profileImage ? <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" /> : emp.name.charAt(0)}
                                </div>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{emp.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {leaveEmps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold mb-1">
                            ✈️ On Leave
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {leaveEmps.map(emp => {
                               const assignment = getAssignment(roster, emp, date);
                               const reason = assignment?.reason?.split('|')[3] || 'Leave';
                               return (
                                 <div key={emp.id} className="bg-amber-50/50 dark:bg-amber-900/10 pl-1 pr-3 py-1 rounded-lg border border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                                   <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-bold text-amber-600">
                                      {emp.profileImage ? <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" /> : emp.name.charAt(0)}
                                   </div>
                                   <div className="flex flex-col">
                                     <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{emp.name}</span>
                                     <span className="text-[9px] text-amber-600 dark:text-amber-500 leading-tight">{reason}</span>
                                   </div>
                                 </div>
                               );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {unsortedLeave.length > 0 && (
            <div className="card mt-4 overflow-hidden border-none shadow-sm bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-500 font-bold flex items-center gap-2">
                    <span className="text-lg">✈️</span> On Leave
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-amber-200 dark:border-amber-900/50 md:pl-4">
                  {unsortedLeave.map(emp => {
                     const assignment = getAssignment(roster, emp, date);
                     const reason = assignment?.reason?.split('|')[3] || 'Leave';
                     return (
                       <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                         <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-bold text-amber-600">
                            {emp.profileImage ? <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" /> : emp.name.charAt(0)}
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
          )}

          {unsortedOff.length > 0 && (
            <div className="card mt-4 overflow-hidden border-none shadow-sm bg-gray-50 dark:bg-gray-800/40">
              <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-bold flex items-center gap-2">
                    <span className="text-lg">🛌</span> Off Day
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-gray-200 dark:border-gray-700 md:pl-4">
                  {unsortedOff.map(emp => (
                     <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                       <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500">
                          {emp.profileImage ? <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" /> : emp.name.charAt(0)}
                       </div>
                       <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{emp.name}</span>
                     </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
