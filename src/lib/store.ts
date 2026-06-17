import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials, LeaveRecord
} from '@/types';

const API_URL = "https://script.google.com/macros/s/AKfycbzQ2n_G0D9e92Jv7XU_a_R71W7-xTz1u3vjZnt1L2T4a-LtsW_416m90hVv4H84LzE9/exec";

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const SHIFT_INFO: Record<ShiftType, ShiftInfo> = {
  morning: { type: 'morning', label: 'Morning', time: '7:00 AM – 3:30 PM', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  evening: { type: 'evening', label: 'Evening', time: '2:30 PM – 11:00 PM', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-200 dark:border-cyan-800' },
  night:   { type: 'night', label: 'Night', time: '10:30 PM – 7:00 AM', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
  off:     { type: 'off', label: 'Off Day', time: 'No Shift', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700' },
};

// ─── localStorage helpers ─────────────────────────────────────────
const LS_EMP    = 'rs_employees_v1';
const LS_ROSTER = 'rs_roster_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes before background refresh

function lsGet<T>(key: string): { data: T; ts: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function lsSet(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota full */ }
}

function lsClear(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ─── Date helpers ─────────────────────────────────────────────────
function toISODate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const match = dateStr.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/i);
  if (match) {
    const MONTHS: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const y = parseInt(match[3], 10);
    const m = MONTHS[match[2].toLowerCase()];
    const day = parseInt(match[1], 10);
    if (m !== undefined) {
      const dt = new Date(y, m, day);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
  }
  return dateStr;
}

function toEmployee(e: Record<string, unknown>): Employee {
  return {
    id:           String(e.id           ?? ''),
    name:         String(e.name         ?? ''),
    employeeId:   String(e.employeeId   ?? ''),
    role:         String(e.role         ?? ''),
    active:       e.active === true || e.active === 'TRUE',
    createdAt:    toISODate(String(e.createdAt ?? '')),
    weeklyOffDay: typeof e.weeklyOffDay === 'number' ? e.weeklyOffDay : (e.weeklyOffDay ? parseInt(String(e.weeklyOffDay), 10) : undefined),
    defaultShift: (e.defaultShift as ShiftType) || 'morning',
  };
}

function toAssignment(a: Record<string, unknown>): ShiftAssignment {
  return {
    employeeId:       String(a.employeeId    ?? ''),
    shift:            (a.shift as ShiftType) ?? 'morning',
    effectiveFrom:    toISODate(String(a.effectiveFrom ?? '')),
    effectiveTo:      toISODate(String(a.effectiveTo  ?? '')),
    reason:           (a.reason && a.reason !== '') ? String(a.reason) : undefined,
    isOffDayOverride: a.isOffDayOverride === true || a.isOffDayOverride === 'TRUE',
  };
}

// ─── API ──────────────────────────────────────────────────────────
async function apiGet(action: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}?action=${action}`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error(json.message || 'API request failed');
  return json.data;
}

async function apiPost(action: string, payload: unknown): Promise<void> {
  await fetch(`${API_URL}?action=${action}`, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ─── In-memory cache ──────────────────────────────────────────────
let cachedEmployees: Employee[] | null = null;
let cachedRoster: RosterData | null = null;

export function invalidateCache() {
  cachedEmployees = null;
  cachedRoster = null;
  lsClear(LS_EMP);
  lsClear(LS_ROSTER);
}

// ─── Employees ────────────────────────────────────────────────────
async function fetchEmployeesFromAPI(): Promise<Employee[]> {
  const raw = await apiGet('getEmployees') as unknown as Record<string, unknown>[];
  const employees = raw.map(toEmployee);
  cachedEmployees = employees;
  lsSet(LS_EMP, employees);
  return employees;
}

export async function getEmployees(): Promise<Employee[]> {
  // 1. In-memory cache (fastest)
  if (cachedEmployees) return cachedEmployees;

  // 2. localStorage cache (instant on repeat visits)
  const cached = lsGet<Employee[]>(LS_EMP);
  if (cached) {
    cachedEmployees = cached.data;
    // Refresh in background if stale
    if (Date.now() - cached.ts > CACHE_TTL) {
      fetchEmployeesFromAPI().catch(() => {});
    }
    return cachedEmployees;
  }

  // 3. Fetch from API (first ever visit)
  return fetchEmployeesFromAPI();
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  await apiPost('saveEmployees', { employees });
  cachedEmployees = employees;
  lsSet(LS_EMP, employees);
}

// ─── Roster ───────────────────────────────────────────────────────
async function fetchRosterFromAPI(): Promise<RosterData> {
  const raw = await apiGet('getRoster') as unknown as Record<string, unknown[]>;
  const roster: RosterData = {};
  for (const [date, assignments] of Object.entries(raw)) {
    roster[date] = (assignments as Record<string, unknown>[]).map(toAssignment);
  }
  cachedRoster = roster;
  lsSet(LS_ROSTER, roster);
  return roster;
}

export async function getRoster(): Promise<RosterData> {
  // 1. In-memory cache (fastest)
  if (cachedRoster) return cachedRoster;

  // 2. localStorage cache (instant on repeat visits)
  const cached = lsGet<RosterData>(LS_ROSTER);
  if (cached) {
    cachedRoster = cached.data;
    // Refresh in background if stale
    if (Date.now() - cached.ts > CACHE_TTL) {
      fetchRosterFromAPI().catch(() => {});
    }
    return cachedRoster;
  }

  // 3. Fetch from API (first ever visit)
  return fetchRosterFromAPI();
}

export async function saveRoster(roster: RosterData): Promise<void> {
  await apiPost('saveRoster', { roster });
  cachedRoster = roster;
  lsSet(LS_ROSTER, roster);
}

// ─── Assignment helpers ───────────────────────────────────────────
export function upsertAssignmentLocal(roster: RosterData, date: string, assignment: ShiftAssignment): RosterData {
  const others = (roster[date] ?? []).filter(a => a.employeeId !== assignment.employeeId);
  return { ...roster, [date]: [...others, assignment] };
}

export async function upsertAssignment(roster: RosterData, date: string, assignment: ShiftAssignment): Promise<RosterData> {
  const next = upsertAssignmentLocal(roster, date, assignment);
  await saveRoster(next);
  return next;
}

export async function applyWeeklyOffDay(
  roster: RosterData, employee: Employee,
  offWeekday: number, year: number, month: number, startDay: number = 1
): Promise<RosterData> {
  const days = new Date(year, month, 0).getDate();
  let updated = { ...roster };
  for (let d = startDay; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isOff   = new Date(year, month - 1, d).getDay() === offWeekday;
    updated = upsertAssignmentLocal(updated, dateStr, {
      employeeId: employee.id,
      shift: isOff ? 'off' : (employee.defaultShift ?? 'morning'),
      effectiveFrom: dateStr, effectiveTo: dateStr,
    });
  }
  await saveRoster(updated);
  return updated;
}

export async function overrideSingleDay(
  roster: RosterData, employee: Employee,
  date: string, shift: ShiftType, reason?: string,
): Promise<RosterData> {
  return upsertAssignment(roster, date, {
    employeeId: employee.id,
    shift, effectiveFrom: date, effectiveTo: date, reason, isOffDayOverride: true,
  });
}

// ─── Leave helpers ────────────────────────────────────────────────
export function getLeaveOnDate(roster: RosterData, employeeId: string, dateStr: string): LeaveRecord | null {
  const a = (roster[dateStr] ?? []).find(x => x.employeeId === employeeId && x.reason?.startsWith('LEAVE|'));
  if (a) {
    const parts = a.reason!.split('|');
    return { employeeId, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
  }
  return null;
}

export function isOnLeave(roster: RosterData, employeeId: string, dateStr: string): boolean {
  return !!getLeaveOnDate(roster, employeeId, dateStr);
}

export function getActiveLeave(roster: RosterData, employeeId: string): LeaveRecord | null {
  const today = todayKey();
  for (let i = -3; i <= 31; i++) {
    const dt = new Date(new Date(today + 'T00:00:00').getTime() + i * 86400000);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const a = (roster[dateStr] ?? []).find(x => x.employeeId === employeeId && x.reason?.startsWith('LEAVE|'));
    if (a) {
      const parts = a.reason!.split('|');
      if (parts[2] >= today) {
        return { employeeId, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
      }
    }
  }
  return null;
}

// ─── Date utilities ───────────────────────────────────────────────
// Switches "today" at exactly 7 AM BDT (UTC+6)
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

export function getDateAssignments(roster: RosterData, date: string): ShiftAssignment[] {
  return roster[date] ?? [];
}

// ─── Night Shift Progress ─────────────────────────────────────────
export function getNightShiftProgress(
  roster: RosterData,
  employeeId: string,
  selectedDate: string = todayKey(),
) {
  function shiftOn(dateStr: string): ShiftType | null {
    const a = (roster[dateStr] ?? []).find(a => a.employeeId === employeeId);
    return a ? a.shift : null;
  }

  function isLeave(dateStr: string): boolean {
    return isOnLeave(roster, employeeId, dateStr);
  }

  function offsetDate(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function isInBlock(dateStr: string): boolean {
    const s = shiftOn(dateStr);
    return s === 'night' || s === 'off';
  }

  if (!isInBlock(selectedDate)) {
    const dt = new Date(selectedDate + 'T00:00:00');
    return { rangeFrom: dt, rangeTo: dt, totalNights: 0, completedNights: 0, remainingNights: 0 };
  }

  const MAX_SCAN = 366;
  let blockStart = selectedDate;
  for (let i = 1; i <= MAX_SCAN; i++) {
    const prev = offsetDate(selectedDate, -i);
    if (!isInBlock(prev)) break;
    blockStart = prev;
  }

  let blockEnd = selectedDate;
  for (let i = 1; i <= MAX_SCAN; i++) {
    const next = offsetDate(selectedDate, i);
    if (!isInBlock(next)) break;
    blockEnd = next;
  }

  let completedNights = 0;
  let remainingNights = 0;
  let cur = blockStart;
  while (cur <= blockEnd) {
    if (shiftOn(cur) === 'night' && !isLeave(cur)) {
      if (cur <= selectedDate) completedNights += 1;
      else remainingNights += 1;
    }
    cur = offsetDate(cur, 1);
  }

  return {
    rangeFrom: new Date(blockStart + 'T00:00:00'),
    rangeTo:   new Date(blockEnd   + 'T00:00:00'),
    totalNights: completedNights + remainingNights,
    completedNights,
    remainingNights,
  };
}

// ─── Site Settings ────────────────────────────────────────────────
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const raw = await apiGet('getSiteSettings');
    return {
      siteName:  String(raw.siteName  ?? 'Routine Sales'),
      logoEmoji: String(raw.logoEmoji ?? '📋'),
      logoImage: raw.logoImage ? String(raw.logoImage) : undefined,
    };
  } catch {
    return { siteName: 'Routine Sales', logoEmoji: '📋' };
  }
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await apiPost('saveSiteSettings', { settings });
}

// ─── Admin Credentials ────────────────────────────────────────────
export async function getAdminCreds(): Promise<AdminCredentials> {
  try {
    const raw = await apiGet('getAdminCreds');
    return {
      username: raw.username ? String(raw.username) : undefined,
      password: raw.password ? String(raw.password) : undefined,
    };
  } catch {
    return {};
  }
}

export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  await apiPost('saveAdminCreds', { creds });
}
