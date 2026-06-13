export interface Student {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceRecord {
  id: string; // Unique record ID: `${studentId}_${date}`
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  notes?: string;
  markedAt: string;
}

export interface DayProgress {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}
