'use client';
import { useState } from 'react';
import { Employee, ShiftType, RosterData, ShiftAssignment } from '@/types';
import {
  SHIFT_INFO, WEEKDAYS,
  upsertAssignmentLocal, saveRoster, saveArchiveRoster,
  applyWeeklyOffDay,
} from '@/lib/store';
import { ConfirmDialog } from '@/components/shared/Dialogs';

interface Props {
  employee: Employee;
  date: string;
  currentAssignment?: ShiftAssignment;
  roster: RosterData;
  isArchive?: boolean;
  onSave(newRoster: RosterData, updatedEmployee?: Employee): void;
  onClose(): void;
}


export default function AssignShiftModal({ employee, date, currentAssignment, roster, isArchive = false, onSave, onClose }: Props) {
  const isExistingLeave = currentAssignment?.reason?.startsWith('LEAVE|');
  const isExistingOff = currentAssignment?.shift === 'off' && currentAssignment?.reason?.startsWith('OFF|');
  
  const [shift, setShift]     = useState<ShiftType | 'leave'>(isExistingLeave ? 'leave' : (currentAssignment?.shift ?? 'morning'));
  const [leaveType, setLeaveType] = useState<'full' | 'half'>(currentAssignment?.reason?.includes('HALF') ? 'half' : 'full');
  
  const initialTargetShift = isExistingLeave ? (currentAssignment?.shift as ShiftType) :
                             isExistingOff ? (currentAssignment.reason?.split('|')[1] as ShiftType) :
                             (currentAssignment?.shift && currentAssignment.shift !== 'off' ? currentAssignment.shift : 'morning');
  const [targetShift, setTargetShift] = useState<ShiftType>(initialTargetShift);
  const [fromDate, setFrom]   = useState(date);
  const [toDate, setTo]       = useState(date);
  const [reason, setReason]   = useState('');
  const [isWeekly, setIsWeekly] = useState(false);
  const [includeWeeklyOff, setIncludeWeeklyOff] = useState(false);
  const [saving, setSaving]   = useState(false);
  
  const [year, month] = date.split('-').map(Number);
  const clickedDateObj = new Date(date + 'T00:00:00');
  const [selectedWeekday, setSelectedWeekday] = useState(clickedDateObj.getDay());
  const [weeklyOffWeekday, setWeeklyOffWeekday] = useState(selectedWeekday);
  
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean; title: string; message: string; isDestructive?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });

  async function handleSave() {
    setSaving(true);
    try {
      const [fy, fm, fd] = fromDate.split('-').map(Number);
      const [ty, tm, td] = toDate.split('-').map(Number);
      const start   = new Date(fy, fm - 1, fd);
      const end     = new Date(ty, tm - 1, td);
      let current   = new Date(start);
      let updated   = { ...roster };

      while (current <= end) {
        let isOffDay = false;

        if (shift === 'off' && isWeekly) {
          if (current.getDay() !== selectedWeekday) {
            current.setDate(current.getDate() + 1);
            continue;
          }
        }
        
        if (['morning', 'evening', 'night'].includes(shift) && includeWeeklyOff) {
          if (current.getDay() === weeklyOffWeekday) {
            isOffDay = true;
          }
        }

        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        
        let finalShift = isOffDay ? 'off' : shift;
        let finalReason = reason || undefined;
        
        if (shift === 'leave') {
           finalShift = targetShift;
           finalReason = `LEAVE|${leaveType.toUpperCase()}` + (reason ? `|${reason}` : '');
        } else if (shift === 'off') {
           finalReason = `OFF|${targetShift}` + (reason ? `|${reason}` : '');
        } else if (isOffDay) {
           finalReason = `OFF|${shift}` + (reason ? `|${reason}` : '');
        }
        
        updated = upsertAssignmentLocal(updated, `${y}-${m}-${d}`, {
          employeeId:    employee.id,
          shift: finalShift as ShiftType,
          effectiveFrom: fromDate,
          effectiveTo:   toDate,
          reason: finalReason,
        }, employee);
        current.setDate(current.getDate() + 1);
      }

      if (isArchive) {
        await saveArchiveRoster(updated, fromDate);
      } else {
        await saveRoster(updated);
      }

      const updatedEmp: Employee = { ...employee, defaultShift: shift !== 'leave' && shift !== 'off' ? (shift as ShiftType) : employee.defaultShift };
      onSave(updated, updatedEmp);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  // ✅ FIXED: Now properly deletes the assignment from the database
  function handleClear() {
    setConfirmConfig({
      open: true,
      title: 'Remove Shifts',
      message: 'Are you sure you want to completely remove all assigned shifts for this date range?',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(p => ({ ...p, open: false }));
        setSaving(true);
        try {
          const [fy, fm, fd] = fromDate.split('-').map(Number);
          const [ty, tm, td] = toDate.split('-').map(Number);
          const start   = new Date(fy, fm - 1, fd);
          const end     = new Date(ty, tm - 1, td);
          let current   = new Date(start);
          let updated   = { ...roster };

          while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            // Filter out both the hidden UUID and the public Employee ID to guarantee deletion
            const others = (updated[dateStr] ?? []).filter(a => a.employeeId !== employee.id && a.employeeId !== employee.employeeId);
            updated = { ...updated, [dateStr]: others };

            current.setDate(current.getDate() + 1);
          }

          await saveRoster(updated);
          onSave(updated, employee);
        } finally {
          setSaving(false);
          onClose();
        }
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold text-lg">⇄</div>
            <div>
              <h2 className="font-semibold text-lg">Assign Shift</h2>
              <p className="text-xs text-gray-500">[{employee.employeeId}] {employee.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Shift Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(['morning', 'evening', 'night', 'off', 'leave'] as const).map(s => {
              if (s === 'leave') {
                return (
                  <button key={s} onClick={() => { setShift(s); }}
                    className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all
                      ${shift === s
                        ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700 font-semibold'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                    <div className="text-sm font-medium">✈️ Leave</div>
                    <div className="text-xs opacity-60">Full or Half Day</div>
                  </button>
                );
              }
              const info = SHIFT_INFO[s as ShiftType];
              return (
                <button key={s} onClick={() => { setShift(s); }}
                  className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all
                    ${shift === s
                      ? `${info.bg} ${info.color} ${info.border} font-semibold`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <div className="text-sm font-medium">{info.label}</div>
                  <div className="text-xs opacity-60">{info.time}</div>
                </button>
              );
            })}
          </div>
        </div>

        {(shift === 'leave' || shift === 'off') && (
          <div className="space-y-3">
            {shift === 'leave' && (
              <>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Leave Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setLeaveType('full')}
                    className={`py-2 px-3 rounded-xl border-2 text-sm text-center transition-all ${leaveType === 'full' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                    Full Day
                  </button>
                  <button onClick={() => setLeaveType('half')}
                    className={`py-2 px-3 rounded-xl border-2 text-sm text-center transition-all ${leaveType === 'half' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                    Half Day
                  </button>
                </div>
              </>
            )}
            
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{shift === 'off' ? 'Off from which shift?' : 'Which Shift?'}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['morning', 'evening', 'night'] as ShiftType[]).map(hs => {
                  const info = SHIFT_INFO[hs];
                  return (
                    <button key={hs} onClick={() => setTargetShift(hs)}
                      className={`py-1.5 px-2 rounded-lg border-2 text-xs text-center transition-all ${targetShift === hs ? `${info.border} ${info.bg} ${info.color} font-bold` : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          
          {shift === 'off' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Recurrence</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setIsWeekly(false)}
                  className={`py-2 px-3 rounded-xl border-2 text-sm text-center transition-all ${!isWeekly ? 'border-gray-500 bg-gray-100 dark:bg-gray-800 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                  Single Day
                </button>
                <button onClick={() => setIsWeekly(true)}
                  className={`py-2 px-3 rounded-xl border-2 text-sm text-center transition-all ${isWeekly ? 'border-gray-500 bg-gray-100 dark:bg-gray-800 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                  Weekly Off Day
                </button>
              </div>
              
              {isWeekly && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Select Day of Week</label>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day, idx) => (
                      <button key={idx} onClick={() => setSelectedWeekday(idx)}
                        className={`py-2 rounded-lg text-xs font-medium border transition-all ${selectedWeekday === idx ? 'bg-gray-700 text-white border-gray-700 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-300'}`}>
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                    This sets every <strong>{WEEKDAYS[selectedWeekday]}</strong> as an off day within the date range selected below. All other days in this range will remain untouched.
                  </p>
                </div>
              )}
            </div>
          )}

          {['morning', 'evening', 'night'].includes(shift) && (
            <div className="pt-2">
              <label className="flex items-center gap-3 mb-3 cursor-pointer">
                <input type="checkbox" checked={includeWeeklyOff} onChange={e => setIncludeWeeklyOff(e.target.checked)} className="w-4 h-4 text-teal-600 rounded cursor-pointer" />
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Include Weekly Off Day</span>
              </label>
              
              {includeWeeklyOff && (
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {WEEKDAYS.map((day, i) => (
                    <button key={day} onClick={() => setWeeklyOffWeekday(i)}
                      className={`py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${weeklyOffWeekday === i ? 'bg-teal-500 text-white border-teal-600 shadow-sm' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400'}`}>
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From Date</label>
              <input type="date" className="input" value={fromDate}
                onChange={e => { setFrom(e.target.value); if (e.target.value > toDate) setTo(e.target.value); }} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To Date</label>
              <input type="date" className="input" value={toDate} min={fromDate}
                onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Reason <span className="text-gray-400 font-normal lowercase">(optional)</span></label>
            <textarea
              className="input min-h-[60px]"
              placeholder={shift === 'off' ? "Reason for Off Day..." : "Reason for this shift change..."}
              value={reason} onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button 
            onClick={handleClear} 
            disabled={saving}
            className="text-xs font-medium text-red-500 hover:text-red-700 dark:text-red-400 border border-transparent hover:border-red-200 dark:hover:border-red-900 px-3 py-2 rounded-lg transition-colors">
            🗑️ Clear Dates
          </button>
          
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost border border-gray-200 dark:border-gray-700">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : shift === 'leave'
                ? `Assign ${leaveType === 'full' ? 'Full Day' : 'Half Day'} Leave`
                : shift === 'off' ? 'Assign Off Day' : 'Assign Shift'}
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog {...confirmConfig} onCancel={() => setConfirmConfig(p => ({ ...p, open: false }))} />
    </div>
  );
}
