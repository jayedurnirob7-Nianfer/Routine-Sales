import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials, LeaveRecord
} from '@/types';

const API_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const SHIFT_INFO: Record<ShiftType, ShiftInfo> = {
  morning: { type: 'morning', label: 'Morning', time: '7:00 AM – 3:30 PM', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  evening: { type: 'evening', label: 'Evening', time: '2:30 PM – 11:00 PM', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-200 dark:border-cyan-800' },
  night:   { type: 'night', label: 'Night', time: '10:30 PM – 7:00 AM', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
  off:     { type: 'off', label: 'Off Day', time: 'No Shift', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700' },
};

const LS_KEY = 'rs_all_v2';
const CACHE_TTL = 5 * 60 * 1000;

function lsGet<T>(key: string): { data: T; ts: number } | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function lsSet(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function lsClear(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch {}
}

function toISODate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const match = dateStr.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/i);
  if (match) {
    const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const m = MONTHS[match[2].toLowerCase()];
    if (m !== undefined) {
      const dt = new Date(parseInt(match[3],10), m, parseInt(match[1],10));
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
  }
  return dateStr;
}

// ✅ Magically decodes the image URL from the role column!
function toEmployee(e: Record<string, unknown>): Employee {
  let role = String(e.role ?? '');
  let profileImage: string | undefined = undefined;
  
  if (role.includes('|IMG:')) {
    const parts = role.split('|IMG:');
    role = parts[0];
    profileImage = parts[1];
  }

  return {
    id:           String(e.id           ?? ''),
    name:         String(e.name         ?? ''),
    employeeId:   String(e.employeeId   ?? ''),
    role:         role,
    active:       true,
    createdAt:    toISODate(String(e.createdAt ?? '')),
    weeklyOffDay: typeof e.weeklyOffDay === 'number' ? e.weeklyOffDay : (e.weeklyOffDay ? parseInt(String(e.weeklyOffDay), 10) : undefined),
    defaultShift: (e.defaultShift as ShiftType) || 'morning',
    profileImage: profileImage,
  };
}

function toAssignment(a: Record<string, unknown>): ShiftAssignment {
  return {
    employeeId:       String(a.employeeId ?? ''),
    shift:            (a.shift as ShiftType) ?? 'morning',
    effectiveFrom:    toISODate(String(a.effectiveFrom ?? '')),
    effectiveTo:      toISODate(String(a.effectiveTo  ?? '')),
    reason:           (a.reason && a.reason !== '') ? String(a.reason) : undefined,
    isOffDayOverride: a.isOffDayOverride === true || a.isOffDayOverride === 'TRUE',
  };
}

function toRoster(raw: Record<string, unknown[]>): RosterData {
  const roster: RosterData = {};
  for (const [date, assignments] of Object.entries(raw)) {
    roster[date] = (assignments as Record<string, unknown>[]).map(toAssignment);
  }
  return roster;
}

interface AllData {
  employees: Employee[];
  roster: RosterData;
  settings: SiteSettings;
  auth: AdminCredentials;
}

let memCache: AllData | null = null;
let fetchPromise: Promise<AllData> | null = null;

export function invalidateCache() {
  memCache = null;
  fetchPromise = null;
  lsClear(LS_KEY);
}

async function fetchAll(): Promise<AllData> {
  if (fetchPromise) return fetchPromise;
  
  fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}?action=getAll`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'ok') throw new Error(json.message || 'API error');
      const d = json.data;
      const result: AllData = {
        employees: (d.employees as Record<string, unknown>[]).map(toEmployee),
        roster:    toRoster(d.roster as Record<string, unknown[]>),
        settings:  {
          siteName:  String(d.settings?.siteName  ?? 'PXL Sales Routine'),
          logoEmoji: String(d.settings?.logoEmoji ?? '⬡'),
          logoImage: d.settings?.logoImage ? String(d.settings.logoImage) : undefined,
        },
        auth: {
          username: d.auth?.username ? String(d.auth.username) : undefined,
          password: d.auth?.password ? String(d.auth.password) : undefined,
        },
      };
      memCache = result;
      lsSet(LS_KEY, result);
      return result;
    } finally {
      fetchPromise = null;
    }
  })();
  
  return fetchPromise;
}

async function getAll(): Promise<AllData> {
  if (memCache) return memCache;
  const cached = lsGet<AllData>(LS_KEY);
  if (cached) {
    memCache = cached.data;
    if (Date.now() - cached.ts > CACHE_TTL) fetchAll().catch(() => {});
    return memCache;
  }
  return fetchAll();
}

async function apiPost(action: string, payload: Record<string, unknown>): Promise<void> {
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
}

export async function getEmployees(): Promise<Employee[]> { return (await getAll()).employees; }
export async function getRoster(): Promise<RosterData> { return (await getAll()).roster; }
export async function getSiteSettings(): Promise<SiteSettings> {
  try { return (await getAll()).settings; } catch { return { siteName: 'PXL', logoEmoji: '⬡' }; }
}
export async function getAdminCreds(): Promise<AdminCredentials> {
  try { return (await getAll()).auth; } catch { return {}; }
}

// ✅ Magically encodes the image URL into the role column before saving!
export async function saveEmployees(employees: Employee[]): Promise<void> {
  const payload = employees.map(e => ({
    ...e,
    role: e.profileImage ? `${e.role}|IMG:${e.profileImage}` : e.role,
  }));
  await apiPost('saveEmployees', { employees: payload });
  if (memCache) { memCache = { ...memCache, employees }; lsSet(LS_KEY, memCache); }
}

export async function saveRoster(roster: RosterData): Promise<void> {
  await apiPost('saveRoster', { roster });
  if (memCache) { memCache = { ...memCache, roster }; lsSet(LS_KEY, memCache); }
}
export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await apiPost('saveSettings', { settings });
  if (memCache) { memCache = { ...memCache, settings }; lsSet(LS_KEY, memCache); }
}
export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  await apiPost('saveAuth', { auth: creds });
  if (memCache) { memCache = { ...memCache, auth: creds }; lsSet(LS_KEY, memCache); }
}

export function getAssignment(roster: RosterData, employee: Employee, date: string): ShiftAssignment | undefined {
  return (roster[date] ?? []).find(a => a.employeeId === employee.id || a.employeeId === employee.employeeId);
}

export function upsertAssignmentLocal(roster: RosterData, date: string, assignment: ShiftAssignment): RosterData {
  let empId1 = assignment.employeeId;
  let empId2 = assignment.employeeId;
  if (memCache) {
    const emp = memCache.employees.find(e => e.id === assignment.employeeId || e.employeeId === assignment.employeeId);
    if (emp) { empId1 = emp.id; empId2 = emp.employeeId; }
  }
  const others = (roster[date] ?? []).filter(a => a.employeeId !== empId1 && a.employeeId !== empId2);
  return { ...roster, [date]: [...others, assignment] };
}

export async function upsertAssignment(roster: RosterData, date: string, assignment: ShiftAssignment): Promise<RosterData> {
  const next = upsertAssignmentLocal(roster, date, assignment);
  await saveRoster(next);
  return next;
}

export async function applyWeeklyOffDay(
  roster: RosterData, employee: Employee, offWeekday: number, year: number, month: number, startDay = 1
): Promise<RosterData> {
  const days = new Date(year, month, 0).getDate();
  let updated = { ...roster };
  for (let d = startDay; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isOff = new Date(year, month - 1, d).getDay() === offWeekday;
    
    const existing = getAssignment(updated, employee, dateStr);
    
    updated = upsertAssignmentLocal(updated, dateStr, {
      employeeId: employee.id,
      shift: isOff ? 'off' : (existing ? existing.shift : (employee.defaultShift ?? 'morning')),
      effectiveFrom: existing ? (existing.effectiveFrom || dateStr) : dateStr,
      effectiveTo: existing ? (existing.effectiveTo || dateStr) : dateStr,
      reason: existing ? existing.reason : undefined,
      isOffDayOverride: isOff ? true : (existing ? existing.isOffDayOverride : false),
    });
  }
  await saveRoster(updated);
  return updated;
}

export async function overrideSingleDay(
  roster: RosterData, employee: Employee, date: string, shift: ShiftType, reason?: string,
): Promise<RosterData> {
  return upsertAssignment(roster, date, {
    employeeId: employee.id, shift, effectiveFrom: date, effectiveTo: date, reason, isOffDayOverride: true,
  });
}

export function getLeaveOnDate(roster: RosterData, employee: Employee, dateStr: string): LeaveRecord | null {
  const a = (roster[dateStr] ?? []).find(x => (x.employeeId === employee.id || x.employeeId === employee.employeeId) && x.reason?.startsWith('LEAVE|'));
  if (a) {
    const parts = a.reason!.split('|');
    return { employeeId: employee.id, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
  }
  return null;
}

export function isOnLeave(roster: RosterData, employee: Employee, dateStr: string): boolean {
  return !!getLeaveOnDate(roster, employee, dateStr);
}

export function getActiveLeave(roster: RosterData, employee: Employee): LeaveRecord | null {
  const today = todayKey();
  for (let i = -3; i <= 31; i++) {
    const dt = new Date(new Date(today + 'T00:00:00').getTime() + i * 86400000);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const a = (roster[dateStr] ?? []).find(x => (x.employeeId === employee.id || x.employeeId === employee.employeeId) && x.reason?.startsWith('LEAVE|'));
    if (a) {
      const parts = a.reason!.split('|');
      if (parts[2] >= today) return { employeeId: employee.id, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
    }
  }
  return null;
}

export function getEffectiveDate(inputDate?: Date): Date {
  const date = inputDate || new Date();
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const bdtDate = new Date(utc + (3600000 * 6));
  if (bdtDate.getHours() < 7) bdtDate.setDate(bdtDate.getDate() - 1);
  return bdtDate;
}

export function todayKey(): string {
  const d = getEffectiveDate();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function get15Days(startDate: string): string[] {
  const [y, m, d] = startDate.split('-').map(Number);
  return Array.from({ length: 15 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
export function getWeekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
  const dates: string[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() === weekday)
      dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  return dates;
}

export function getNightShiftProgress(
  roster: RosterData, employee: Employee, selectedDate: string = todayKey(),
) {
  const [year, month] = selectedDate.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bdtDate = new Date(utc + (3600000 * 6));
  const bdtHour = bdtDate.getHours();
  const bdtMinute = bdtDate.getMinutes();

  // The shift is considered started if it's past 10:30 PM or before 7:00 AM
  const isCurrentNightShiftStarted = (bdtHour === 22 && bdtMinute >= 30) || (bdtHour > 22) || (bdtHour < 7);
  const actualToday = todayKey(); // This represents the 'roster day' we are currently in

  let completed = 0;
  let remaining = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const assignment = getAssignment(roster, employee, dateStr);
    
    // Not assigned to night shift -> skip
    if (!assignment || assignment.shift !== 'night') continue;
    
    // On leave -> skip
    if (isOnLeave(roster, employee, dateStr)) continue;

    // Automatically exclude their weekly off day!
    const dDate = new Date(year, month - 1, d);
    if (employee.weeklyOffDay !== undefined && dDate.getDay() === employee.weeklyOffDay) {
      continue;
    }

    if (dateStr < actualToday) {
      completed++;
    } else if (dateStr === actualToday && isCurrentNightShiftStarted) {
      completed++;
    } else {
      remaining++;
    }
  }

  const total = completed + remaining;

  return { year, month, completed, remaining, total };
}
