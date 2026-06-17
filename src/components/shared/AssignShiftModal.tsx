'use client';
import { useState } from 'react';
import { Employee, ShiftType, RosterData } from '@/types';
import {
  SHIFT_INFO, WEEKDAYS,
  upsertAssignmentLocal, saveRoster,
  applyWeeklyOffDay, overrideSingleDay,
} from '@/lib/store';

interface Props {
  employee: Employee;
  date: string;
  currentShift?: ShiftType;
  roster: RosterData;
  onSave(newRoster: RosterData, updatedEmployee?: Employee): void;
  onClose(): void;
}

type OffMode = 'weekly' | 'single' | null;

export default function AssignShiftModal({ employee, date, currentShift, roster, onSave, onClose }: Props) {
  const [shift, setShift]     = useState<ShiftType>(currentShift ?? 'morning');
  const [fromDate, setFrom]   = useState(date);
  const [toDate, setTo]       = useState(date);
  const [reason, setReason]   = useState('');
  const [offMode, setOffMode] = useState<OffMode>(null);
  const [saving, setSaving]   = useState(false);

  const [selectedWeekday, setSelectedWeekday] = useState<number>(
    employee.weeklyOffDay ?? new Date(date + 'T00:00:00').getDay()
  );

  const [year, month] = date.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const showOffOptions = shift === 'off';

  async function handleSave() {
    setSaving(true);
    try {
      if (shift === 'off') {
        if (offMode === 'weekly') {
          const updatedEmp: Employee = {
            ...employee,
            weeklyOffDay: selectedWeekday,
            defaultShift: employee.defaultShift ?? 'morning',
          };
          const [fy, fm, fd] = fromDate.split('-').map(Number);
          const updated = await applyWeeklyOffDay(roster, updatedEmp, selectedWeekday, fy, fm, fd);
          onSave(updated, updatedEmp);
        } else if (offMode === 'single') {
          const updated = await overrideSingleDay(roster, employee, fromDate, 'off', reason);
          onSave(updated);
        }
      } else {
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
          
          updated = upsertAssignmentLocal(updated, `${y}-${m}-${d}`, {
            employeeId:    employee.id,
            shift,
            effectiveFrom: fromDate,
            effectiveTo:   toDate,
            reason: reason || undefined,
          });
          current.setDate(current.getDate() + 1);
        }

        await saveRoster(updated);

        const updatedEmp: Employee = { ...employee, defaultShift: shift };
        onSave(updated, updatedEmp);
      }
    } finally {
      setSaving(false);
      onClose();
    }
  }

  // NEW FEATURE: Clears out all shift data for the selected date range
  async function handleClear() {
    if (!confirm('Are you sure you want to completely remove all assigned shifts for this date range?')) return;
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

        // Filters out this specific employee's assignment for this day, effectively deleting it
        const others = (updated[dateStr] ?? []).filter(a => a.employeeId !== employee.id);
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

  const canSave = !showOffOptions || offMode !== null;

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
            {(['morning', 'evening', 'night', 'off'] as ShiftType[]).map(s => {
              const info = SHIFT_INFO[s];
              return (
                <button key={s} onClick={() => { setShift(s); setOffMode(null); }}
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

        {showOffOptions && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Off Day Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setOffMode('weekly')}
                className={`p-3 rounded-xl border-2 text-left transition-all
                  ${offMode === 'weekly' ? 'border-gray-500 bg-gray-100 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                <div className="text-sm font-semibold">🔁 Weekly Off Day</div>
                <div className="text-xs text-gray-500 mt-0.5">Same day every week this month</div>
              </button>
              <button onClick={() => setOffMode('single')}
                className={`p-3 rounded-xl border-2 text-left transition-all
                  ${offMode === 'single' ? 'border-gray-500 bg-gray-100 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                <div className="text-sm font-semibold">📅 Single Override</div>
                <div className="text-xs text-gray-500 mt-0.5">Change just this one day</div>
              </button>
            </div>

            {offMode === 'weekly' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Effective From</label>
                  <input type="date" className="input" value={fromDate} onChange={e => setFrom(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Shifts before this date will stay exactly as they are.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Select Weekly Off Day</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {WEEKDAYS.map((day, idx) => (
                      <button key={idx} onClick={() => setSelectedWeekday(idx)}
                        className={`py-2 rounded-lg text-xs font-medium border transition-all
                          ${selectedWeekday === idx
                            ? 'bg-gray-700 text-white border-gray-700'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-600 dark:text-gray-300'}`}>
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Regular Shift (other days)</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['morning', 'evening', 'night'] as ShiftType[]).map(s => {
                      const info = SHIFT_INFO[s];
                      const isSelected = (employee.defaultShift ?? 'morning') === s;
                      return (
                        <div key={s} className={`px-2 py-1.5 rounded-lg text-xs text-center border ${info.bg} ${info.color} ${info.border}`}>
                          {info.label}{isSelected && <span className="ml-1">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Non-off days will be set to the employee's default shift. Change it from the Employees page.</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  📋 Every <strong>{WEEKDAYS[selectedWeekday]}</strong> in <strong>{monthName}</strong> will be set to <strong>Off Day</strong>. All other days → regular shift.
                </div>
              </div>
            )}

            {offMode === 'single' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Date</label>
                  <input type="date" className="input" value={fromDate} onChange={e => setFrom(e.target.value)} />
                </div>
                <p className="text-xs text-gray-400">Only this single day will change. The rest of the month stays the same.</p>
              </div>
            )}
          </div>
        )}

        {!showOffOptions && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From</label>
              <input type="date" className="input" value={fromDate}
                onChange={e => { setFrom(e.target.value); if (e.target.value > toDate) setTo(e.target.value); }} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To</label>
              <input type="date" className="input" value={toDate} min={fromDate}
                onChange={e => setTo(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Reason <span className="normal-case font-normal">(optional)</span>
          </label>
          <textarea className="input resize-none" rows={2}
            placeholder="Reason for this shift change..."
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        <div className="flex items-center justify-between pt-2">
          {/* New Clear Button to wipe out historical mistakes! */}
          <button 
            onClick={handleClear} 
            disabled={saving}
            className="text-xs font-medium text-red-500 hover:text-red-700 dark:text-red-400 border border-transparent hover:border-red-200 dark:hover:border-red-900 px-3 py-2 rounded-lg transition-colors">
            🗑️ Clear Dates
          </button>
          
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost border border-gray-200 dark:border-gray-700">Cancel</button>
            <button onClick={handleSave} disabled={!canSave || saving}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : shift === 'off' && offMode === 'weekly'
                ? `Set ${WEEKDAYS[selectedWeekday]}s as Off`
                : shift === 'off' && offMode === 'single'
                ? 'Set Off — This Day Only'
                : 'Assign Shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
