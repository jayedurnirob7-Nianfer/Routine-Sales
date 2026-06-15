'use client';
import { useEffect, useState } from 'react';
import {
  getEmployees, getRoster, SHIFT_INFO, todayKey, formatDate,
  get15Days, removeAssignment, upsertAssignment,
} from '@/lib/store';
import { Employee, RosterData, ShiftAssignment, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import AssignShiftModal from '@/components/shared/AssignShiftModal';

type DetailModal = { shift: ShiftType; date: string } | null;

const shiftIcons: Record<ShiftType, string> = {
  morning: '🌅', evening: '🌆', night: '🌙', off: '🛌',
};

export default function RosterPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [roster, setRoster]           = useState<RosterData>({});
  const [startDate, setStartDate]     = useState(todayKey());
  const [assignModal, setAssignModal] = useState<{ emp: Employee; date: string } | null>(null);
  const [detailModal, setDetailModal] = useState<DetailModal>(null);
  const [loading, setLoading]         = useState(true);

  const [selectedEmps, setSelectedEmps]   = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate]           = useState(todayKey());
  const [bulkShift, setBulkShift]         = useState<ShiftType>('morning');
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  useEffect(() => {
    Promise.all([getEmployees(), getRoster()]).then(([emps, ros]) => {
      setEmployees(emps);
      setRoster(ros);
      setLoading(false);
    });
  }, []);

  const today  = todayKey();
  const active = employees.filter(e => e.active);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const dates  = get15Days(startDate);

  function getShift(empId: string, date: string): ShiftAssignment | undefined {
    return (roster[date] ?? []).find(a => a.employeeId === empId);
  }

  async function handleRemove(empId: string, date: string) {
    if (!confirm('Remove this assignment?')) return;
    const next = await removeAssignment(roster, date, empId);
    setRoster(next);
  }

  function toggleSelect(empId: string) {
    setSelectedEmps(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }

  function selectAll() {
    if (selectedEmps.size === active.length) setSelectedEmps(new Set());
    else setSelectedEmps(new Set(active.map(e => e.id)));
  }

  async function applyBulkAssign() {
    if (selectedEmps.size === 0) return;
    let updated = { ...roster };
    for (const empId of selectedEmps) {
      updated = await upsertAssignment(updated, bulkDate, {
        employeeId: empId, shift: bulkShift,
        effectiveFrom: bulkDate, effectiveTo: bulkDate,
      });
    }
    setRoster(updated);
    setSelectedEmps(new Set());
    setShowBulkPanel(false);
  }

  function getShiftDetail(shift: ShiftType, date: string) {
    return (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => ({ assignment: a, emp: empMap[a.employeeId] }))
      .filter(x => x.emp);
  }

  function getShiftHistory(shift: ShiftType) {
    return Object.entries(roster)
      .filter(([date]) => date < today)
      .map(([date, assignments]) => ({
        date,
        people: assignments
          .filter(a => a.shift === shift)
          .map(a => empMap[a.employeeId])
          .filter(Boolean) as Employee[],
      }))
      .filter(x => x.people.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shift Roster</h1>
          <p className="text-gray-500 text-sm mt-1">15-day schedule view</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Starting from:</label>
          <input type="date" className="input w-44" value={startDate}
            onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(['morning', 'evening', 'night'] as ShiftType[]).map(shift => {
          const info       = SHIFT_INFO[shift];
          const todayCount = (roster[today] ?? []).filter(a => a.shift === shift).length;
          return (
            <button key={shift} onClick={() => setDetailModal({ shift, date: today })}
              className={`card p-3 text-left transition-all hover:shadow-md hover:scale-[1.01] border-2 ${info.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <span>{shiftIcons[shift]}</span>
                <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
              </div>
              <div className="text-xs text-gray-500">{info.time}</div>
              <div className={`text-xl font-bold mt-1 ${info.color}`}>
                {todayCount} <span className="text-xs font-normal text-gray-400">today</span>
              </div>
              <div className="text-xs text-teal-500 mt-1">Click to view details →</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.values(SHIFT_INFO).map(s => (
          <div key={s.type} className={`px-2 py-1 rounded-lg ${s.bg} ${s.color} border ${s.border}`}>
            {s.label[0]} = {s.label} {s.time !== '—' ? `(${s.time})` : ''}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="card p-3 flex flex-wrap items-center gap-3">
          <button onClick={selectAll}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
              ${selectedEmps.size === active.length && active.length > 0
                ? 'bg-teal-600 text-white border-teal-600'
                : 'border-gray-300 dark:border-gray-600 hover:border-teal-400'}`}>
            {selectedEmps.size === active.length && active.length > 0 ? '✓ Deselect All' : 'Select All'}
          </button>

          {selectedEmps.size > 0 && (
            <>
              <span className="text-xs text-teal-600 font-medium">
                {selectedEmps.size} employee{selectedEmps.size > 1 ? 's' : ''} selected
              </span>
              <button onClick={() => setShowBulkPanel(!showBulkPanel)} className="btn-primary text-xs">
                Assign Shift to Selected →
              </button>
              <button onClick={() => setSelectedEmps(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                Clear
              </button>
            </>
          )}

          {selectedEmps.size === 0 && (
            <span className="text-xs text-gray-400">
              ☝️ Click checkboxes to select employees, then bulk assign a shift
            </span>
          )}
        </div>
      )}

      {showBulkPanel && selectedEmps.size > 0 && (
        <div className="card p-4 border-2 border-teal-400 space-y-3">
          <h3 className="font-semibold text-sm">Bulk Assign — {selectedEmps.size} employees selected</h3>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selectedEmps).map(id => {
              const emp = empMap[id];
              return emp ? (
                <span key={id} className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-700">
                  {emp.name}
                </span>
              ) : null;
            })}
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" className="input w-40" value={bulkDate}
                onChange={e => setBulkDate(e.target.value)} min={today} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Shift</label>
              <div className="flex gap-1.5">
                {(['morning', 'evening', 'night', 'off'] as ShiftType[]).map(s => {
                  const info = SHIFT_INFO[s];
                  return (
                    <button key={s} onClick={() => setBulkShift(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${bulkShift === s
                          ? `${info.bg} ${info.color} border-current`
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                      {shiftIcons[s]} {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={applyBulkAssign} className="btn-primary text-xs">
                ✓ Apply to {selectedEmps.size} employee{selectedEmps.size > 1 ? 's' : ''}
              </button>
              <button onClick={() => setShowBulkPanel(false)} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-auto">
        <table className="text-xs min-w-max w-full">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              {isAdmin && <th className="px-2 py-3 w-8"></th>}
              <th className="px-4 py-3 text-left sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 w-44 min-w-44 font-semibold text-gray-600 dark:text-gray-300">
                Employee
              </th>
              {dates.map(d => {
                const isToday = d === today;
                const isPast  = d < today;
                return (
                  <th key={d} className={`px-0 py-2 text-center w-14 min-w-14 font-medium
                    ${isToday ? 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' : isPast ? 'text-gray-400' : 'text-gray-500'}`}>
                    <div className="text-xs">{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : ''}`}>{new Date(d + 'T00:00:00').getDate()}</div>
                    <div className="text-xs text-gray-400">{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {active.map(emp => {
              const isSelected = selectedEmps.has(emp.id);
              return (
                <tr key={emp.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 group transition-colors
                    ${isSelected ? 'bg-teal-50/60 dark:bg-teal-900/20' : ''}`}>
                  {isAdmin && (
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleSelect(emp.id)}
                        className="w-3.5 h-3.5 accent-teal-600 cursor-pointer" />
                    </td>
                  )}
                  <td className={`px-4 py-2.5 sticky left-0 z-10 border-r border-gray-100 dark:border-gray-800 w-44 min-w-44 max-w-44 transition-colors
                    ${isSelected
                      ? 'bg-teal-50 dark:bg-teal-900/30 group-hover:bg-teal-50 dark:group-hover:bg-teal-900/30'
                      : 'bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/40'}`}>
                    <div className="font-medium text-sm">{emp.name}</div>
                    <div className="text-gray-400 text-xs">{emp.employeeId}</div>
                  </td>
                  {dates.map(d => {
                    const a       = getShift(emp.id, d);
                    const shift   = a?.shift;
                    const info    = shift ? SHIFT_INFO[shift] : null;
                    const isPast  = d < today;
                    const isToday = d === today;
                    return (
                      <td key={d} className={`px-0 py-1 text-center w-14 min-w-14
                        ${isToday ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}`}>
                        {info ? (
                          <div className="relative group/cell flex justify-center">
                            <span className={`inline-flex w-8 h-8 rounded-lg text-xs font-bold items-center justify-center
                              ${info.bg} ${info.color} border ${info.border} ${isPast ? 'opacity-60' : ''}`}>
                              {info.label[0]}
                            </span>
                            {isAdmin && !isPast && (
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full hidden group-hover/cell:flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-0.5 shadow-lg z-20 whitespace-nowrap">
                                <button className="text-teal-600 hover:text-teal-700 text-xs px-1"
                                  onClick={() => setAssignModal({ emp, date: d })}>Edit</button>
                                <button className="text-red-500 hover:text-red-600 text-xs px-1"
                                  onClick={() => handleRemove(emp.id, d)}>✕</button>
                              </div>
                            )}
                          </div>
                        ) : (
                          isAdmin && !isPast ? (
                            <div className="flex justify-center">
                              <button onClick={() => setAssignModal({ emp, date: d })}
                                className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-300 hover:border-teal-400 hover:text-teal-400 transition-colors text-sm">
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-200 dark:text-gray-700">—</span>
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {active.length === 0 && <p className="text-center py-10 text-gray-400">No active employees found.</p>}
      </div>

      {assignModal && (
        <AssignShiftModal
          employee={assignModal.emp}
          date={assignModal.date}
          currentShift={getShift(assignModal.emp.id, assignModal.date)?.shift}
          roster={roster}
          onSave={(newRoster) => setRoster(newRoster)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {detailModal && (() => {
        const info      = SHIFT_INFO[detailModal.shift];
        const todayList = getShiftDetail(detailModal.shift, detailModal.date);
        const history   = getShiftHistory(detailModal.shift);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{shiftIcons[detailModal.shift]}</span>
                  <div>
                    <h2 className={`font-bold text-lg ${info.color}`}>{info.label} Shift</h2>
                    <p className="text-xs text-gray-500">{info.time}</p>
                  </div>
                </div>
                <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">
                  📅 Today — {formatDate(detailModal.date)}
                </h3>
                {todayList.length === 0 ? (
                  <p className="text-gray-400 text-sm">No one assigned today.</p>
                ) : (
                  <div className="space-y-2">
                    {todayList.map(({ emp, assignment }) => (
                      <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl ${info.bg} border ${info.border}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${info.color} bg-white/60`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <div className={`font-medium text-sm ${info.color}`}>{emp.name}</div>
                          <div className="text-xs text-gray-500">{emp.employeeId} · {emp.role}</div>
                          {assignment.reason && <div className="text-xs text-gray-400 mt-0.5">Note: {assignment.reason}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">🕐 Past Assignments</h3>
                {history.length === 0 ? (
                  <p className="text-gray-400 text-sm">No past records found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {history.map(h => (
                      <div key={h.date} className="flex gap-3 items-start py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{formatDate(h.date)}</span>
                        <div className="flex flex-wrap gap-1">
                          {h.people.map(e => (
                            <span key={e.id} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                              {e.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
