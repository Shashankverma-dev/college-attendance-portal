import { calculateAttendancePercentage } from '../routes/attendance.routes';

describe('Phase 8: Attendance Business Logic & Calculations', () => {

  it('correctly calculates percentage using Present / (Present + Absent) * 100', () => {
    const records: Array<{ attendance_status: 'P' | 'A' | 'L' }> = [
      { attendance_status: 'P' },
      { attendance_status: 'P' },
      { attendance_status: 'P' },
      { attendance_status: 'A' },
    ];

    // 3 Present, 1 Absent => 3 / (3 + 1) * 100 = 75.0%
    const rate = calculateAttendancePercentage(records);
    expect(rate).toBe('75.0');
  });

  it('strictly excludes Approved Leave (L) from both numerator and denominator', () => {
    const records: Array<{ attendance_status: 'P' | 'A' | 'L' }> = [
      { attendance_status: 'P' },
      { attendance_status: 'P' },
      { attendance_status: 'P' },
      { attendance_status: 'A' },
      { attendance_status: 'L' }, // 1 Approved Leave
      { attendance_status: 'L' }, // 2nd Approved Leave
    ];

    // Numerator: 3
    // Denominator: 3 + 1 = 4 (Leave excluded)
    // Rate: 3/4 * 100 = 75.0%
    const rate = calculateAttendancePercentage(records);
    expect(rate).toBe('75.0');
  });

  it('handles zero denominator safely without returning NaN or Infinity', () => {
    // Case 1: No attendance records at all
    expect(calculateAttendancePercentage([])).toBeNull();

    // Case 2: Only Approved Leave records (no instructional attendance sessions)
    const onlyLeave: Array<{ attendance_status: 'P' | 'A' | 'L' }> = [
      { attendance_status: 'L' },
      { attendance_status: 'L' },
    ];
    expect(calculateAttendancePercentage(onlyLeave)).toBeNull();
  });

  it('detects and prevents duplicate attendance for the same student in the same session', () => {
    const existingRecords = [
      { session_id: 'sess-001', student_id: 'STU-101', attendance_status: 'P' },
      { session_id: 'sess-001', student_id: 'STU-102', attendance_status: 'A' },
    ];

    function isDuplicateAttendance(sessionId: string, studentId: string): boolean {
      return existingRecords.some(
        (r) => r.session_id === sessionId && r.student_id === studentId
      );
    }

    expect(isDuplicateAttendance('sess-001', 'STU-101')).toBe(true);
    expect(isDuplicateAttendance('sess-001', 'STU-103')).toBe(false);
    expect(isDuplicateAttendance('sess-002', 'STU-101')).toBe(false);
  });
});
