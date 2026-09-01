'use client';
import { useState } from 'react';
import { Employee, ShiftType, RosterData, ShiftAssignment } from '@/types';
import {
  SHIFT_INFO, WEEKDAYS,
  upsertAssignmentLocal, saveRoster, saveArchiveRoster,
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
  
  const [shift, setShift] = useState<ShiftType | 'leave'>(isExistingLeave ? 'leave' : (currentAssignment?.shift ?? employee.defaultShift ?? 'morning'));
  const [leaveType, setLeaveType] = useState<'full' | 'half'>(currentAssignment?.reason?.includes('HALF') ? 'half' : 'full');
  
  const initialTargetShift = isExistingLeave ? (currentAssignment?.shift as ShiftType) :
                             isExistingOff ? (currentAssignment.reason?.split('|')[1] as ShiftType) :
                             (currentAssignment?.shift && currentAssignment.shift !== 'off' ? currentAssignment.shift : (employee.defaultShift || 'morning'));
  const [targetShift, setTargetShift] = useState<ShiftType>(initialTargetShift);
  const [fromDate, setFrom] = useState(date);
  const [toDate, setTo] = useState(date);
  const [reason, setReason] = useState('');
  
  const clickedDateObj = new Date(date + 'T00:00:00');
  const initialOffDay = typeof employee.weeklyOffDay === 'number' ? employee.weeklyOffDay : 5; // Default Friday (5) or employee's off day
  const [includeWeeklyOff, setIncludeWeeklyOff] = useState(employee.weeklyOffDay !== undefined || isExistingOff);
  const [weeklyOffWeekday, setWeeklyOffWeekday] = useState(initialOffDay);
  
  // Off Day specific recurrence
  const [offRecurrence, setOffRecurrence] = useState<'single' | 'weekly'>(isExistingOff ? 'weekly' : 'single');
  
  const [saving, setSaving] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean; title: string; message: string; isDestructive?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });

  async function handleSave() {
    setSaving(true);
    try {
      const [fy, fm, fd] = fromDate.split('-').map(Number);
      const [ty, tm, td] = toDate.split('-').map(Number);
      const start = new Date(fy, fm - 1, fd);
      const end = new Date(ty, tm - 1, td);
      let current = new Date(start);
      let updated = { ...roster };

      while (current <= end) {
        const currentDayOfWeek = current.getDay();
        let isOffDay = false;

        if (shift === 'off') {
          if (offRecurrence === 'weekly') {
            if (currentDayOfWeek === weeklyOffWeekday) {
              isOffDay = true;
            } else {
              isOffDay = false; // Work day with target base shift
            }
          } else {
            isOffDay = true;
          }
        } else if (['morning', 'evening', 'night'].includes(shift)) {
          if (includeWeeklyOff && currentDayOfWeek === weeklyOffWeekday) {
            isOffDay = true;
          }
        } else if (shift === 'leave') {
          if (includeWeeklyOff && currentDayOfWeek === weeklyOffWeekday) {
            isOffDay = true;
          }
        }

        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;
        
        let finalShift: ShiftType = 'morning';
        let finalReason: string | undefined = reason || undefined;

        if (isOffDay) {
          finalShift = 'off';
          const base = (shift !== 'off' && shift !== 'leave') ? shift : targetShift;
          finalReason = `OFF|${base}` + (reason ? `|${reason}` : '');
        } else if (shift === 'leave') {
          finalShift = targetShift;
          finalReason = `LEAVE|${leaveType.toUpperCase()}` + (reason ? `|${reason}` : '');
        } else if (shift === 'off' && offRecurrence === 'weekly') {
          finalShift = targetShift;
          finalReason = reason || undefined;
        } else {
          finalShift = shift as ShiftType;
          finalReason = reason || undefined;
        }
        
        updated = upsertAssignmentLocal(updated, dateKey, {
          employeeId: employee.id,
          shift: finalShift,
          effectiveFrom: fromDate,
          effectiveTo: toDate,
          reason: finalReason,
          isOffDayOverride: isOffDay,
        }, employee);

        current.setDate(current.getDate() + 1);
      }

      if (isArchive) {
        await saveArchiveRoster(updated, fromDate);
      } else {
        await saveRoster(updated);
      }

      const updatedEmp: Employee = { 
        ...employee, 
        defaultShift: shift !== 'leave' && shift !== 'off' ? (shift as ShiftType) : (targetShift || employee.defaultShift),
        weeklyOffDay: includeWeeklyOff || (shift === 'off' && offRecurrence === 'weekly') ? weeklyOffWeekday : employee.weeklyOffDay,
      };

      onSave(updated, updatedEmp);
    } finally {
      setSaving(false);
      onClose();
    }
  }

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
          const start = new Date(fy, fm - 1, fd);
          const end = new Date(ty, tm - 1, td);
          let current = new Date(start);
          let updated = { ...roster };

          while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

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

  const selectedOffDayLabel = WEEKDAYS[weeklyOffWeekday];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="card p-6 w-full max-w-md space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-gray-800">

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              ⇄
            </div>
            <div>
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">Assign Shift & Off Day</h2>
              <p className="text-xs text-gray-500 font-medium">[{employee.employeeId}] {employee.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1">✕</button>
        </div>

        {/* Shift Type Selection */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">1. Select Shift</label>
          <div className="grid grid-cols-2 gap-2">
            {(['morning', 'evening', 'night', 'off', 'leave'] as const).map(s => {
              if (s === 'leave') {
                return (
                  <button key={s} onClick={() => setShift(s)}
                    className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all col-span-2 sm:col-span-1
                      ${shift === s
                        ? 'bg-rose-50 text-rose-900 border-rose-400 dark:bg-rose-900/30 dark:text-rose-100 dark:border-rose-600 font-bold shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                    <div className="text-sm font-semibold flex items-center gap-1.5"><span>✈️</span> Leave</div>
                    <div className="text-[11px] opacity-70">Full or Half Day</div>
                  </button>
                );
              }
              const info = SHIFT_INFO[s as ShiftType];
              return (
                <button key={s} onClick={() => setShift(s)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all
                    ${shift === s
                      ? `${info.bg} ${info.color} ${info.border} font-bold shadow-sm ring-1 ring-current/20`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  <div className="text-sm font-semibold">{info.label}</div>
                  <div className="text-[11px] opacity-70">{info.time}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Leave Configuration */}
        {shift === 'leave' && (
          <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl space-y-3 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 mb-1.5">Leave Duration</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setLeaveType('full')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${leaveType === 'full' ? 'border-rose-500 bg-rose-500 text-white shadow-sm' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                  Full Day Leave
                </button>
                <button onClick={() => setLeaveType('half')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${leaveType === 'half' ? 'border-rose-500 bg-rose-500 text-white shadow-sm' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                  Half Day Leave
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 mb-1.5">Base Working Shift</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['morning', 'evening', 'night'] as ShiftType[]).map(hs => {
                  const info = SHIFT_INFO[hs];
                  return (
                    <button key={hs} onClick={() => setTargetShift(hs)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all ${targetShift === hs ? `${info.border} ${info.bg} ${info.color} font-bold ring-1 ring-current` : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Off Day Configuration */}
        {shift === 'off' && (
          <div className="p-3.5 bg-stone-50 dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800 rounded-2xl space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setOffRecurrence('single')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${offRecurrence === 'single' ? 'border-stone-600 bg-stone-700 text-white shadow-sm' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                Specific Dates Only
              </button>
              <button onClick={() => setOffRecurrence('weekly')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${offRecurrence === 'weekly' ? 'border-stone-600 bg-stone-700 text-white shadow-sm' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                Weekly Recurring
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1.5">Regular Shift on Workdays</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['morning', 'evening', 'night'] as ShiftType[]).map(hs => {
                  const info = SHIFT_INFO[hs];
                  return (
                    <button key={hs} onClick={() => setTargetShift(hs)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all ${targetShift === hs ? `${info.border} ${info.bg} ${info.color} font-bold ring-1 ring-current` : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. Unified Weekly Off Day Section */}
        {(shift !== 'off' || offRecurrence === 'weekly') && (
          <div className="p-4 bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200/70 dark:border-teal-900/50 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={includeWeeklyOff} 
                  onChange={e => setIncludeWeeklyOff(e.target.checked)} 
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 cursor-pointer accent-teal-600" 
                />
                <span className="text-xs font-bold uppercase tracking-wider text-teal-900 dark:text-teal-200">
                  2. Include Weekly Off Day
                </span>
              </label>
              <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">
                {includeWeeklyOff ? `Every ${selectedOffDayLabel}` : 'Off'}
              </span>
            </div>

            {includeWeeklyOff && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-[11px] text-teal-800 dark:text-teal-300">
                  Choose which day of the week will be their off day:
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day, i) => (
                    <button 
                      key={day} 
                      type="button"
                      onClick={() => setWeeklyOffWeekday(i)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        weeklyOffWeekday === i 
                          ? 'bg-teal-600 text-white border-teal-700 shadow-md scale-105 ring-2 ring-teal-400/30' 
                          : 'border-teal-200 dark:border-teal-800/80 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-400'
                      }`}
                    >
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>
                    In the range below, every <strong>{selectedOffDayLabel}</strong> gets <strong>Off Day</strong>, and other days get <strong>{shift === 'leave' ? 'Leave' : shift === 'off' ? targetShift : shift}</strong>.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Date Range Selection */}
        <div className="space-y-3 pt-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">3. Date Range</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">From Date</span>
              <input 
                type="date" 
                className="input w-full font-medium" 
                value={fromDate}
                onChange={e => { setFrom(e.target.value); if (e.target.value > toDate) setTo(e.target.value); }} 
              />
            </div>
            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">To Date</span>
              <input 
                type="date" 
                className="input w-full font-medium" 
                value={toDate} 
                min={fromDate}
                onChange={e => setTo(e.target.value)} 
              />
            </div>
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Reason <span className="text-gray-400 font-normal lowercase">(optional)</span>
          </label>
          <textarea
            className="input min-h-[55px] w-full text-xs"
            placeholder={shift === 'off' ? "Reason for Off Day..." : shift === 'leave' ? "Reason for Leave..." : "Reason for shift assignment..."}
            value={reason} 
            onChange={e => setReason(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <button 
            type="button"
            onClick={handleClear} 
            disabled={saving}
            className="text-xs font-semibold text-rose-500 hover:text-rose-700 dark:text-rose-400 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 px-2.5 py-2 rounded-lg transition-colors">
            🗑️ Clear Range
          </button>
          
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost border border-gray-200 dark:border-gray-700 text-xs">Cancel</button>
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={saving || !fromDate || !toDate}
              className="btn-primary text-xs flex items-center gap-1.5 shadow-lg shadow-teal-500/20 disabled:opacity-40">
              {saving ? 'Saving…' : 'Assign'}
            </button>
          </div>
        </div>

      </div>
      <ConfirmDialog {...confirmConfig} onCancel={() => setConfirmConfig(p => ({ ...p, open: false }))} />
    </div>
  );
}

