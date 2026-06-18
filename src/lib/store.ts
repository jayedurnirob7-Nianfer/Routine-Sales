export function getNightShiftProgress(
  roster: RosterData, employee: Employee, selectedDate: string = todayKey(),
) {
  function offsetDate(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  let inNightBlock = false;
  const current = getAssignment(roster, employee, selectedDate);
  if (current && current.shift === 'night') {
    inNightBlock = true;
  } else if (current && current.shift === 'off') {
    for (let i = 1; i <= 2; i++) {
      const p = getAssignment(roster, employee, offsetDate(selectedDate, -i));
      if (p && p.shift === 'night') { inNightBlock = true; break; }
      const n = getAssignment(roster, employee, offsetDate(selectedDate, i));
      if (n && n.shift === 'night') { inNightBlock = true; break; }
    }
  }

  if (!inNightBlock) {
    const dt = new Date(selectedDate + 'T00:00:00');
    return { rangeFrom: dt, rangeTo: dt, totalNights: 0, completedNights: 0, remainingNights: 0 };
  }

  // --- NEW LOGIC: Scan specific roster data to precisely find the block boundaries! ---
  let minStartStr = selectedDate;
  let maxEndStr = selectedDate;
  
  let curBack = offsetDate(selectedDate, -1);
  while (true) {
     const a = getAssignment(roster, employee, curBack);
     // If the shift is not assigned, it breaks the block and stops!
     if (a && (a.shift === 'night' || a.shift === 'off')) {
        minStartStr = curBack;
        curBack = offsetDate(curBack, -1);
     } else {
        break; 
     }
  }

  let curFwd = offsetDate(selectedDate, 1);
  while (true) {
     const a = getAssignment(roster, employee, curFwd);
     if (a && (a.shift === 'night' || a.shift === 'off')) {
        maxEndStr = curFwd;
        curFwd = offsetDate(curFwd, 1);
     } else {
        break;
     }
  }

  let completedNights = 0, remainingNights = 0;
  let cur = minStartStr;
  while (cur <= maxEndStr) {
    const s = getAssignment(roster, employee, cur)?.shift;
    if (s === 'night' && !isOnLeave(roster, employee, cur)) {
      if (cur <= selectedDate) completedNights++;
      else remainingNights++;
    }
    cur = offsetDate(cur, 1);
  }

  return {
    rangeFrom: new Date(minStartStr + 'T00:00:00'),
    rangeTo:   new Date(maxEndStr   + 'T00:00:00'),
    totalNights: completedNights + remainingNights,
    completedNights, remainingNights,
  };
}
