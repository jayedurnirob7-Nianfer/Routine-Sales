'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, getRoster, saveRoster, todayKey, getAssignment, upsertAssignmentLocal } from '@/lib/store';
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
      setSuccess(false); // reset success message on change
    }
  }

  async function handleApplyToLive() {
    setSaving(true);
    let updatedRoster = { ...roster };
    
    const start = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    const empIds = new Set(employees.map(e => e.id));

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const applyDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      
      const oldAssignments = updatedRoster[applyDate] || [];
      updatedRoster[applyDate] = oldAssignments.filter(a => !empIds.has(a.employeeId));

      employees.forEach(emp => {
        const col = sandboxState[emp.id];
        if (col === 'unassigned') return; 
        
        let shift: ShiftType = 'morning';
        let reason: string | undefined = undefined;

        if (col === 'leave') {
          const oldAssign = getAssignment(roster, emp, applyDate);
          shift = (oldAssign?.shift && oldAssign.shift !== 'off') ? oldAssign.shift : 'morning';
          reason = oldAssign?.reason?.startsWith('LEAVE|') ? oldAssign.reason : 'LEAVE|FULL';
        } else {
          shift = col as ShiftType;
        }

        updatedRoster = upsertAssignmentLocal(updatedRoster, applyDate, {
          employeeId: emp.id,
          shift: shift,
          effectiveFrom: applyDate,
          effectiveTo: applyDate,
          reason: reason,
        }, emp);
      });
    }

    await saveRoster(updatedRoster);
    setRoster(updatedRoster);
    setSuccess(true);
    setSaving(false);
    setShowApplyModal(false);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (isAdmin === null || loading) return <div className="p-8 text-center text-gray-500">Loading Sandbox...</div>;
  if (isAdmin === false) return null;

  const activeEmp = activeId ? employees.find(e => e.id === activeId) : null;

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
          {success && <div className="text-green-600 dark:text-green-400 font-bold text-sm bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-right-4">✅ Roster Updated Successfully!</div>}
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

      {/* Date Range Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowApplyModal(false)}>
          <div className="card bg-white dark:bg-gray-900 p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">Apply Roster Draft</h2>
            <p className="text-sm text-gray-500 mb-6">Select the date range to apply this exact layout to.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">From Date</label>
                <input type="date" className="input w-full" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">To Date</label>
                <input type="date" className="input w-full" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 mb-6 flex gap-3 text-amber-800 dark:text-amber-500 text-xs">
              <div className="text-xl">⚠️</div>
              <div>
                <strong>Warning:</strong> This will overwrite existing assignments in this range. The literal columns on this board will be copied identically to every day in the range. Off days will not automatically scatter.
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setShowApplyModal(false)}>Cancel</button>
              <button 
                className="btn-primary flex items-center gap-2" 
                onClick={handleApplyToLive}
                disabled={saving || !fromDate || !toDate || fromDate > toDate}
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Applying...</>
                ) : (
                  'Confirm Apply'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
