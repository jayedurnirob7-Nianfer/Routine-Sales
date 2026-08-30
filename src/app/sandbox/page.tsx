'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, getRoster, saveRoster, todayKey, getAssignment, upsertAssignmentLocal, WEEKDAYS, SHIFT_INFO } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, DragEndEvent, DragStartEvent, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS = ['unassigned', 'morning', 'evening', 'night', 'off', 'leave'] as const;
type SandboxColumn = typeof COLUMNS[number];

const COLUMN_COLORS: Record<SandboxColumn, { bg: string, border: string, title: string }> = {
  unassigned: { bg: 'bg-gray-100/70 dark:bg-gray-800/40', border: 'border-gray-200/50 dark:border-gray-700/50', title: 'Unassigned' },
  morning:    { bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-100 dark:border-amber-900/30', title: 'Morning (7:00 AM)' },
  evening:    { bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-100 dark:border-blue-900/30', title: 'Evening (2:30 PM)' },
  night:      { bg: 'bg-indigo-50 dark:bg-indigo-900/10', border: 'border-indigo-100 dark:border-indigo-900/30', title: 'Night (10:30 PM)' },
  off:        { bg: 'bg-stone-100 dark:bg-stone-900/20', border: 'border-stone-200 dark:border-stone-800', title: 'Off Day' },
  leave:      { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-100 dark:border-red-900/30', title: 'On Leave' },
};

function DraggableEmployee({ emp }: { emp: Employee }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: emp.id,
    data: { emp }
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`p-3 bg-white dark:bg-gray-800/90 border ${isDragging ? 'border-teal-500 shadow-2xl opacity-90 scale-105 z-50 relative ring-2 ring-teal-500/30' : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 shadow-sm hover:shadow-md'} rounded-xl cursor-grab active:cursor-grabbing transition-all flex items-center gap-3 backdrop-blur-sm`}
    >
      {emp.profileImage ? (
        <img src={emp.profileImage} alt={emp.name} className="w-9 h-9 rounded-full object-cover shadow-sm ring-1 ring-black/5" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/50 dark:to-teal-800/50 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-xs shadow-sm ring-1 ring-black/5">
          {emp.name.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13px] text-gray-800 dark:text-gray-200 truncate leading-tight mb-0.5">{emp.name}</p>
        <p className="text-[10px] text-gray-500 font-medium truncate">{emp.employeeId} · {emp.role}</p>
      </div>
      <div className="text-gray-300 dark:text-gray-600 hover:text-gray-400">⋮⋮</div>
    </div>
  );
}

function DroppableColumn({ id, title, employees }: { id: SandboxColumn, title: string, employees: Employee[] }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const config = COLUMN_COLORS[id];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full rounded-2xl border ${config.bg} ${isOver ? 'border-teal-400 border-dashed bg-teal-50/50 dark:bg-teal-900/30 ring-4 ring-teal-500/10' : config.border} transition-all p-2 sm:p-3 shadow-sm overflow-hidden`}
    >
      <div className="flex justify-between items-center mb-4 px-2 py-1">
        <h3 className="font-extrabold text-[12px] text-gray-700 dark:text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shadow-sm ${id === 'unassigned' ? 'bg-gray-400' : id === 'morning' ? 'bg-amber-400' : id === 'evening' ? 'bg-blue-400' : id === 'night' ? 'bg-indigo-400' : id === 'off' ? 'bg-stone-400' : 'bg-red-400'}`}></div>
          {title}
        </h3>
        <span className="bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm border border-black/5 backdrop-blur-sm">
          {employees.length}
        </span>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto pb-10 px-1 custom-scrollbar">
        {employees.length === 0 && (
          <div className="h-28 flex flex-col items-center justify-center text-gray-400 text-xs font-medium italic border-2 border-dashed border-gray-200 dark:border-gray-700/50 rounded-xl bg-white/20 dark:bg-black/10 mx-1">
            <span className="text-2xl mb-2 opacity-50">📥</span>
            Drop here
          </div>
        )}
        {employees.map(emp => (
          <DraggableEmployee key={emp.id} emp={emp} />
        ))}
      </div>
    </div>
  );
}

export default function SandboxPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<RosterData>({});
  const [date, setDate] = useState(todayKey());
  
  // empId -> SandboxColumn
  const [sandboxState, setSandboxState] = useState<Record<string, SandboxColumn>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Modal states
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [fromDate, setFromDate] = useState(todayKey());
  const [toDate, setToDate] = useState(todayKey());
  
  // Smart scheduling options
  const [applyMode, setApplyMode] = useState<'smart' | 'exact'>('smart');
  const [offDayWeekday, setOffDayWeekday] = useState<number>(5); // Default Friday (5)
  const [syncProfiles, setSyncProfiles] = useState<boolean>(true);
  const [leaveBaseShift, setLeaveBaseShift] = useState<ShiftType>('morning');

  useEffect(() => {
    if (isAdmin === false) {
      router.push('/');
    }
  }, [isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const [empsData, ros] = await Promise.all([getEmployees(), getRoster()]);
    const emps = empsData.filter(e => e.active !== false);
    setEmployees(emps);
    setRoster(ros);
    
    // Initialize sandbox state for the current date
    const initialState: Record<string, SandboxColumn> = {};
    emps.forEach(emp => {
      const assignment = getAssignment(ros, emp, date);
      if (!assignment) {
        initialState[emp.id] = 'unassigned';
      } else if (assignment.reason?.startsWith('LEAVE|')) {
        initialState[emp.id] = 'leave';
      } else {
        initialState[emp.id] = (assignment.shift as SandboxColumn) || 'unassigned';
      }
    });
    setSandboxState(initialState);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const empId = active.id as string;
    const toColumn = over.id as SandboxColumn;

    if (sandboxState[empId] !== toColumn) {
      setSandboxState(prev => ({ ...prev, [empId]: toColumn }));
      setSuccess(false);
    }
  }

  async function handleApplyToLive() {
    setSaving(true);
    let updatedRoster = { ...roster };
    let updatedEmployees = [...employees];
    
    const [fy, fm, fd] = fromDate.split('-').map(Number);
    const [ty, tm, td] = toDate.split('-').map(Number);
    const start = new Date(fy, fm - 1, fd);
    const end = new Date(ty, tm - 1, td);
    const empIds = new Set(employees.map(e => e.id));

    let current = new Date(start);
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const applyDate = `${y}-${m}-${d}`;
      const currentDayOfWeek = current.getDay();

      const oldAssignments = updatedRoster[applyDate] || [];
      // Keep assignments of employees not in the active sandbox list
      updatedRoster[applyDate] = oldAssignments.filter(a => !empIds.has(a.employeeId));

      employees.forEach(emp => {
        const col = sandboxState[emp.id];
        if (col === 'unassigned') return;

        const empOffDay = (emp.weeklyOffDay !== undefined) ? emp.weeklyOffDay : offDayWeekday;
        const isOffDayForEmp = (currentDayOfWeek === empOffDay);

        let finalShift: ShiftType = 'morning';
        let finalReason: string | undefined = undefined;
        let isOffDayOverride = false;

        if (applyMode === 'smart') {
          if (col === 'off') {
            // Employee placed in Off Day column -> gets Off Day on recurring day, regular shift on workdays
            if (isOffDayForEmp) {
              finalShift = 'off';
              const base = emp.defaultShift || 'morning';
              finalReason = `OFF|${base}`;
              isOffDayOverride = true;
            } else {
              finalShift = emp.defaultShift || 'morning';
              finalReason = undefined;
            }
          } else if (col === 'leave') {
            if (isOffDayForEmp) {
              finalShift = 'off';
              finalReason = `OFF|${emp.defaultShift || leaveBaseShift}`;
              isOffDayOverride = true;
            } else {
              finalShift = (emp.defaultShift && emp.defaultShift !== 'off') ? emp.defaultShift : leaveBaseShift;
              finalReason = 'LEAVE|FULL';
            }
          } else {
            // col is 'morning' | 'evening' | 'night'
            if (isOffDayForEmp) {
              finalShift = 'off';
              finalReason = `OFF|${col}`;
              isOffDayOverride = true;
            } else {
              finalShift = col as ShiftType;
              finalReason = undefined;
            }
          }
        } else {
          // Exact daily copy mode
          if (col === 'leave') {
            finalShift = (emp.defaultShift && emp.defaultShift !== 'off') ? emp.defaultShift : leaveBaseShift;
            finalReason = 'LEAVE|FULL';
          } else if (col === 'off') {
            finalShift = 'off';
            finalReason = `OFF|${emp.defaultShift || 'morning'}`;
            isOffDayOverride = true;
          } else {
            finalShift = col as ShiftType;
          }
        }

        updatedRoster = upsertAssignmentLocal(updatedRoster, applyDate, {
          employeeId: emp.id,
          shift: finalShift,
          effectiveFrom: fromDate,
          effectiveTo: toDate,
          reason: finalReason,
          isOffDayOverride,
        }, emp);
      });

      current.setDate(current.getDate() + 1);
    }

    // Sync profiles if selected
    if (syncProfiles) {
      updatedEmployees = updatedEmployees.map(emp => {
        const col = sandboxState[emp.id];
        if (col === 'unassigned') return emp;

        let newDefaultShift = emp.defaultShift || 'morning';
        if (col === 'morning' || col === 'evening' || col === 'night') {
          newDefaultShift = col;
        }

        return {
          ...emp,
          defaultShift: newDefaultShift,
          weeklyOffDay: emp.weeklyOffDay !== undefined ? emp.weeklyOffDay : offDayWeekday,
        };
      });
      await saveEmployees(updatedEmployees);
      setEmployees(updatedEmployees);
    }

    await saveRoster(updatedRoster);
    setRoster(updatedRoster);
    setSuccess(true);
    setSaving(false);
    setShowApplyModal(false);
    setTimeout(() => setSuccess(false), 4000);
  }

  if (isAdmin === null || loading) return <div className="p-8 text-center text-gray-500">Loading Sandbox...</div>;
  if (isAdmin === false) return null;

  const activeEmp = activeId ? employees.find(e => e.id === activeId) : null;
  const selectedOffDayName = WEEKDAYS[offDayWeekday];

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="text-teal-500">🧪</span> Shift Sandbox
          </h1>
          <p className="text-gray-500 text-sm mt-1">Draft schedules freely without affecting the live roster until you click Apply.</p>
        </div>
        <div className="flex items-center gap-4">
          {success && <div className="text-green-600 dark:text-green-400 font-bold text-sm bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-right-4">✅ Live Roster Updated Successfully!</div>}
          <button 
            onClick={() => setShowApplyModal(true)}
            className="btn-primary shadow-lg flex items-center gap-2"
          >
            🚀 Apply to Live Roster...
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 min-h-0 pb-4 px-1 overflow-x-hidden overflow-y-auto custom-scrollbar">
          {COLUMNS.map(col => (
            <DroppableColumn 
              key={col} 
              id={col} 
              title={COLUMN_COLORS[col].title} 
              employees={employees.filter(e => sandboxState[e.id] === col)} 
            />
          ))}
        </div>

        <DragOverlay>
          {activeEmp ? (
            <div className="rotate-3 scale-110 shadow-2xl opacity-90 cursor-grabbing">
              <DraggableEmployee emp={activeEmp} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Date Range & Scheduling Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowApplyModal(false)}>
          <div className="card bg-white dark:bg-gray-900 p-6 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Apply Roster Draft</h2>
                <p className="text-xs text-gray-500 font-medium">Apply this layout across single or multiple dates</p>
              </div>
              <button onClick={() => setShowApplyModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1">✕</button>
            </div>
            
            {/* 1. Date Range */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">1. Target Date Range</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">From Date</span>
                  <input type="date" className="input w-full" value={fromDate} onChange={e => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">To Date</span>
                  <input type="date" className="input w-full" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* 2. Schedule Application Mode */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">2. Schedule Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setApplyMode('smart')}
                  className={`p-3 rounded-xl border text-left transition-all ${applyMode === 'smart' ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/20 font-bold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5"><span>🔄</span> Smart Weekly</div>
                  <div className="text-[11px] opacity-75 font-normal mt-0.5">Recurring Off Days</div>
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('exact')}
                  className={`p-3 rounded-xl border text-left transition-all ${applyMode === 'exact' ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/20 font-bold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5"><span>📋</span> Exact Daily</div>
                  <div className="text-[11px] opacity-75 font-normal mt-0.5">Identical Every Day</div>
                </button>
              </div>
            </div>

            {/* 3. Weekly Off Day Selection (if Smart mode) */}
            {applyMode === 'smart' && (
              <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/70 dark:border-teal-900/40 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-900 dark:text-teal-200">
                    Recurring Weekly Off Day
                  </span>
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">
                    Every {selectedOffDayName}
                  </span>
                </div>
                <p className="text-[11px] text-teal-800 dark:text-teal-300">
                  Select the weekly off day to apply across the date range:
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setOffDayWeekday(i)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        offDayWeekday === i
                          ? 'bg-teal-600 text-white border-teal-700 shadow-md scale-105 ring-2 ring-teal-400/30'
                          : 'border-teal-200 dark:border-teal-800/80 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-400'
                      }`}
                    >
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-400 bg-white/70 dark:bg-gray-800/70 p-2.5 rounded-xl border border-teal-100 dark:border-teal-900/30 space-y-1">
                  <p>✨ <strong>Staff in Off Day column:</strong> Get <strong>Off Day</strong> every {selectedOffDayName}, and their base shift on other days.</p>
                  <p>✨ <strong>Staff in Shifts:</strong> Work their assigned shift with {selectedOffDayName} as their recurring off day.</p>
                  <p>✨ <strong>Staff On Leave:</strong> Marked On Leave for workdays with {selectedOffDayName} as Off Day.</p>
                </div>
              </div>
            )}

            {/* Profile Sync Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncProfiles} 
                  onChange={e => setSyncProfiles(e.target.checked)} 
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 cursor-pointer accent-teal-600" 
                />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Save assigned shift & off day to employee profiles as default
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button type="button" className="btn-ghost text-xs border border-gray-200 dark:border-gray-700" onClick={() => setShowApplyModal(false)}>Cancel</button>
              <button 
                type="button"
                className="btn-primary text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20" 
                onClick={handleApplyToLive}
                disabled={saving || !fromDate || !toDate || fromDate > toDate}
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Applying...</>
                ) : (
                  `Confirm & Apply (${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

