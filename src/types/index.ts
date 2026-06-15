export type ShiftType = 'morning' | 'evening' | 'night' | 'off';

export interface ShiftInfo {
  type: ShiftType;
  label: string;
  time: string;
  color: string;
  bg: string;
  border: string;
}

export interface Employee {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  active: boolean;
  createdAt: string;
  weeklyOffDay?: number; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  defaultShift?: ShiftType; // their regular shift on non-off days
}

export interface ShiftAssignment {
  employeeId: string;
  shift: ShiftType;
  effectiveFrom: string;
  effectiveTo: string;
  reason?: string;
  isOffDayOverride?: boolean; // true = single day override, doesn't affect weekly pattern
}

// key: YYYY-MM-DD
export type RosterData = Record<string, ShiftAssignment[]>;

export interface SiteSettings {
  siteName: string;
  logoEmoji: string;
  logoImage?: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
}
