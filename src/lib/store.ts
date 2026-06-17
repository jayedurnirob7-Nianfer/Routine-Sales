// ============================================================
//  src/lib/store.ts  —  Google Sheets backend
// ============================================================
import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials, LeaveRecord
} from '@/types';

export const SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec';

export const SHIFT_INFO: Record<ShiftType, ShiftInfo> = {
  morning: { type: 'morning', label: 'Morning', time: '7:00 AM – 3:30 PM',  color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  evening: { type: 'evening', label: 'Evening', time: '2:30 PM – 11:00 PM', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  night:   { type: 'night',   label: 'Night',   time: '10:30 PM – 7:00 AM', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  off:     { type: 'off',     label: 'Off Day', time: '—',                  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200'   },
};

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type CacheShape = {
  employees: Employee[];
  roster: RosterData;
  settings: SiteSettings;
  auth: AdminCredentials;
  leaves: LeaveRecord[];
};

let _cache: CacheShape | null = null;
let _loadPromise: Promise<CacheShape> | null = null;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function toISODate(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const match = s.match(/([A-Za-z]{3})\w*\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (match) {
    const monKey = match[1].toLowerCase();
    const month  = MONTHS[monKey];
    const day    = Number(match[2]);
    const explicitYear = match[3] ? Number(match[3]) : undefined;
    if (month !== undefined && !Number.isNaN(day)) {
      const now = new Date();
      let year = explicitYear ?? now.getFullYear();
      if (explicitYear === undefined) {
        const candidate = new Date(year, month, day);
        const diffDays = (candidate.getTime() - now.getTime()) / 86400000;
        if (diffDays < -183) year += 1;
      }
      const dt = new Date(year, month, day);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return s;
}

function toEmp(e: Record<string, unknown>): Employee {
  return {
    id:          String(e.id          ?? ''),
    employeeId:  String(e.employeeId  ?? ''),
    name:        String(e.name        ?? ''),
    role:        String(e.role        ?? ''),
    active:      true,
    createdAt:   String(e.createdAt   ?? ''),
    weeklyOffDay: (e.weeklyOffDay !== '' && e.weeklyOffDay != null) ? Number(e.weeklyOffDay) : undefined,
    defaultShift: (e.defaultShift && e.defaultShift !== '') ? e.defaultShift as ShiftType : undefined,
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

function toLeave(l: Record<string, unknown>): LeaveRecord {
  return {
    employeeId: String(l.employeeId ?? ''),
    fromDate:   toISODate(String(l.fromDate ?? '')),
    toDate:     toISODate(String(l.toDate   ?? '')),
    reason:     l.reason ? String(l.reason) : undefined,
  };
}

function toRoster(raw: Record<string, unknown[]>): RosterData {
  const out: RosterData = {};
  for (const [date, list] of Object.entries(raw)) {
    if (date && Array.isArray(list)) {
      const isoDate = toISODate(date);
      const existing = out[isoDate] ?? [];
      out[isoDate] = [...existing, ...list.map(a => toAssignment(a as Record<string, unknown>))];
    }
  }
  return out;
}

async function apiGet(action: string): Promise<Record<string, unknown>> {
  const url = `${SHEET_API_URL}?action=${action}&_t=${Date.now()}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { status: string; data?: unknown; message?: string };
  if (json.status !== 'ok') throw new Error(json.message ?? 'API error');
  return json.data as Record<string, unknown>;
}

async function apiPost(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(SHEET_API_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { status: string; message?: string };
  if (json.status !== 'ok') throw new Error(json.message ?? 'API error');
}

export async function loadAll(): Promise<CacheShape> {
  if (_cache)       return _cache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async (): Promise<CacheShape> => {
    try {
      const raw = await apiGet('getAll') as {
        employees: Record<string, unknown>[];
        roster:    Record<string, unknown[]>;
        settings:  Record<string, string>;
        auth:      Record<string, string>;
        leaves?:   Record<string, unknown>[];
      };
      const employees = Array.isArray(raw.employees) && raw.employees.length > 0 ? raw.employees.map(toEmp) : [];
      const roster   = raw.roster   ? toRoster(raw.roster) : {};
      const leaves   = Array.isArray(raw.leaves) ? raw.leaves.map(toLeave) : [];
      const settings : SiteSettings = {
        siteName  : raw.settings?.siteName   ?? 'PXL Sales Routine',
        logoEmoji : raw.settings?.logoEmoji  ?? '⬛',
        logoImage : raw.settings?.logoImage  || undefined,
      };
      const auth: AdminCredentials = {
        username: raw.auth?.username ?? 'admin',
        password: raw.auth?.password ?? 'admin123',
      };
      _cache = { employees, roster, settings, auth, leaves };
      return _cache;
    } catch (e) {
      _loadPromise = null;
      throw e;
    }
  })();
  return _loadPromise;
}

export function invalidateCache(): void {
  _cache        = null;
  _loadPromise  = null;
}

export async function getEmployees(): Promise<Employee[]> { return (await loadAll()).employees; }
export async function getRoster(): Promise<RosterData> { return (await loadAll()).roster; }
export async function getLeaves(): Promise<LeaveRecord[]> { return (await loadAll()).leaves; }
export async function getSiteSettings(): Promise<SiteSettings> { return (await loadAll()).settings; }
export async function getAdminCreds(): Promise<AdminCredentials> { return (await loadAll()).auth; }

export async function saveEmployees(employees: Employee[]): Promise<void> {
  if (_cache) _cache.employees = employees;
  await apiPost({ action: 'saveEmployees', employees });
}

export async function saveRoster(roster: RosterData): Promise<void> {
  if (_cache) _cache.roster = roster;
  await apiPost({ action: 'saveRoster', roster });
}

export async function saveLeaves(leaves: LeaveRecord[]): Promise<void> {
  if (_cache) _cache.leaves = leaves;
  await apiPost({ action: 'saveLeaves', leaves });
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  if (_cache) _cache.settings = settings;
  await apiPost({ action: 'saveSettings', settings });
}

export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  if (_cache) _cache.auth = creds;
  await apiPost({ action: 'saveAuth', auth: creds });
}

export function upsertAssignmentLocal(roster: RosterData, date: string, assignment: ShiftAssignment): RosterData {
  const others = (roster[date] ?? []).filter(a => a.employeeId !== assignment.employeeId);
  return { ...roster, [date]: [...others, assignment] };
}

export async function upsertAssignment(roster: RosterData, date: string, assignment: ShiftAssignment): Promise<RosterData> {
  const next = upsertAssignmentLocal(roster, date, assignment);
  await saveRoster(next);
  return next;
}

export async function removeAssignment(roster: RosterData, date: string, employeeId: string): Promise<RosterData> {
  const next = { ...roster, [date]: (roster[date] ?? []).filter(a => a.employeeId !== employeeId) };
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
      employeeId: employee.employeeId,
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
    employeeId: employee.employeeId,
    shift, effectiveFrom: date, effectiveTo: date, reason, isOffDayOverride: true,
  });
}

export function isOnLeave(leaves: LeaveRecord[], employeeId: string, dateStr: string): boolean {
  return leaves.some(l => l.employeeId === employeeId && dateStr >= l.fromDate && dateStr <= l.toDate);
}

export function getActiveLeave(leaves: LeaveRecord[], employeeId: string): LeaveRecord | null {
  const today = todayKey();
  const active = leaves.find(l => l.employeeId === employeeId && l.toDate >= today);
  return active || null;
}

export function todayKey(): string {
  const d = new Date();
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

export function getNightShiftProgress(
  roster: RosterData,
  leaves: LeaveRecord[],
  employeeId: string,
  selectedDate: string = todayKey(),
): {
  rangeFrom: Date;
  rangeTo: Date;
  totalNights: number;
  completedNights: number;
  remainingNights: number;
} {
  function shiftOn(dateStr: string): ShiftType | null {
    const a = (roster[dateStr] ?? []).find(a => a.employeeId === employeeId);
    return a ? a.shift : null;
  }

  function isLeave(dateStr: string): boolean {
    return isOnLeave(leaves, employeeId, dateStr);
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
    if (shiftOn(cur) === 'night') {
      if (!isLeave(cur)) {
        if (cur <= selectedDate) { completedNights += 1; }
        else { remainingNights += 1; }
      }
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
