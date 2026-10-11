export interface SegmentDTO {
  activityTypeId: string;
  startMin: number;
  endMin: number;
}

export interface ShiftDTO {
  id: string;
  employeeId: string;
  /** YYYY-MM-DD */
  date: string;
  startMin: number;
  endMin: number;
  note?: string | null;
  segments: SegmentDTO[];
}

export interface ActivityDTO {
  id: string;
  key: string;
  name: string;
  color: string;
  isPhoneTime: boolean;
  isWorkTime: boolean;
  isBreak: boolean;
}

export interface EmployeeDTO {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
  contractType: string;
  weeklyHours: number;
  maxHoursPerDay: number;
  skills: string[];
}

export interface AbsenceDTO {
  employeeId: string;
  /** YYYY-MM-DD, inklusive */
  startDate: string;
  endDate: string;
  kind: string;
}

export interface ServiceWindow {
  weekday: number;
  startMin: number;
  endMin: number;
}
