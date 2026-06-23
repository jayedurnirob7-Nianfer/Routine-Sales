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
  const shifts: ShiftType[] = ['morning', 'evening', 'night', 'off'];
  
  // Group employees by shift for the selected date
  const groupedEmployees: Record<string, Employee[]> = {
    morning: [],
    evening: [],
    night: [],
    off: [],
    leave: []
  };

  employees.forEach(emp => {
    const assignment = getAssignment(roster, emp, date);
    if (assignment) {
      if (assignment.reason?.startsWith('LEAVE|')) {
        groupedEmployees.leave.push(emp);
      } else if (assignment.shift) {
        groupedEmployees[assignment.shift].push(emp);
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
          {(['morning', 'evening', 'night'] as const).map(shift => {
            const emps = groupedEmployees[shift];
            const info = SHIFT_INFO[shift];
            return (
              <div key={shift} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className={`px-4 py-2 font-bold ${info.bg} ${info.color} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{shift === 'morning' ? '☀️' : shift === 'evening' ? '🌆' : '🌙'}</span>
                    <span className="tracking-wide uppercase">{info.label} Shift</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-sm">
                    {emps.length} Assigned
                  </span>
                </div>
                <div className="p-4 bg-white dark:bg-gray-900/50">
                  {emps.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  ) : (
                    <p className="text-gray-400 text-sm italic py-2 text-center">No employees assigned to this shift.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
