describe('Phase 10: Timetable Engine & Conflict Detection', () => {
  /**
   * Half-open interval conflict rule: [start, end)
   * Two slots overlap if: existing.start < proposed.end && proposed.start < existing.end
   */
  function doesTimeOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string
  ): boolean {
    return startA < endB && startB < endA;
  }

  function validateTimeSlot(start: string, end: string): boolean {
    return start < end;
  }

  it('correctly detects overlapping intervals', () => {
    // 09:00 - 10:30 and 10:00 - 11:00 overlap between 10:00 and 10:30
    expect(doesTimeOverlap('09:00', '10:30', '10:00', '11:00')).toBe(true);

    // 10:00 - 12:00 completely engulfs 10:30 - 11:30
    expect(doesTimeOverlap('10:00', '12:00', '10:30', '11:30')).toBe(true);

    // Exact same interval
    expect(doesTimeOverlap('09:00', '10:00', '09:00', '10:00')).toBe(true);
  });

  it('permits adjacent intervals without false conflict', () => {
    // Class A ends at 10:00, Class B starts at 10:00
    // Under half-open interval [start, end), these MUST NOT conflict
    expect(doesTimeOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
    expect(doesTimeOverlap('10:00', '11:00', '09:00', '10:00')).toBe(false);
  });

  it('rejects invalid time slots where end time is <= start time', () => {
    expect(validateTimeSlot('10:00', '11:00')).toBe(true);
    expect(validateTimeSlot('10:00', '10:00')).toBe(false); // Zero duration
    expect(validateTimeSlot('11:00', '10:00')).toBe(false); // Backwards
  });

  it('detects faculty double booking across different sections', () => {
    const existingSlots = [
      {
        faculty_id: 'FAC-201',
        classroom_id: 'ROOM-101',
        section_id: 'SEC-A',
        day_of_week: 'MONDAY',
        start_time: '09:00',
        end_time: '10:00',
      },
    ];

    function checkFacultyConflict(
      facultyId: string,
      day: string,
      start: string,
      end: string
    ): boolean {
      return existingSlots.some(
        (s) =>
          s.faculty_id === facultyId &&
          s.day_of_week === day &&
          doesTimeOverlap(s.start_time, s.end_time, start, end)
      );
    }

    // Same faculty scheduled for another section at the same time: conflict
    expect(checkFacultyConflict('FAC-201', 'MONDAY', '09:30', '10:30')).toBe(true);
    // Same faculty at another time: no conflict
    expect(checkFacultyConflict('FAC-201', 'MONDAY', '10:00', '11:00')).toBe(false);
    // Different faculty at the same time: no faculty conflict
    expect(checkFacultyConflict('FAC-202', 'MONDAY', '09:00', '10:00')).toBe(false);
  });

  it('detects classroom double booking', () => {
    const existingSlots = [
      {
        faculty_id: 'FAC-201',
        classroom_id: 'LAB-204',
        section_id: 'SEC-A',
        day_of_week: 'TUESDAY',
        start_time: '11:00',
        end_time: '13:00',
      },
    ];

    function checkRoomConflict(
      roomId: string,
      day: string,
      start: string,
      end: string
    ): boolean {
      return existingSlots.some(
        (s) =>
          s.classroom_id === roomId &&
          s.day_of_week === day &&
          doesTimeOverlap(s.start_time, s.end_time, start, end)
      );
    }

    // Room LAB-204 booked simultaneously by another group
    expect(checkRoomConflict('LAB-204', 'TUESDAY', '12:00', '13:00')).toBe(true);
    // Another room available
    expect(checkRoomConflict('LAB-205', 'TUESDAY', '11:00', '13:00')).toBe(false);
  });

  it('supports parallel scheduling for distinct practical subgroups (e.g. C1 and C2)', () => {
    const sectionSlots = [
      {
        section_id: 'SEC-A',
        group_name: 'C1',
        faculty_id: 'FAC-201',
        classroom_id: 'LAB-1',
        day_of_week: 'WEDNESDAY',
        start_time: '14:00',
        end_time: '16:00',
      },
    ];

    function canSchedulePracticalGroup(
      sectionId: string,
      groupName: string,
      facultyId: string,
      roomId: string,
      day: string,
      start: string,
      end: string
    ): { allowed: boolean; reason?: string } {
      for (const slot of sectionSlots) {
        if (slot.day_of_week === day && doesTimeOverlap(slot.start_time, slot.end_time, start, end)) {
          // If the same group is already scheduled
          if (slot.section_id === sectionId && slot.group_name === groupName) {
            return { allowed: false, reason: 'Group already scheduled' };
          }
          // If the faculty is double booked
          if (slot.faculty_id === facultyId) {
            return { allowed: false, reason: 'Faculty double booked' };
          }
          // If the room is double booked
          if (slot.classroom_id === roomId) {
            return { allowed: false, reason: 'Room double booked' };
          }
        }
      }
      return { allowed: true };
    }

    // Parallel practical subgroup C2 in LAB-2 with FAC-202: ALLOWED
    const c2Result = canSchedulePracticalGroup(
      'SEC-A',
      'C2',
      'FAC-202',
      'LAB-2',
      'WEDNESDAY',
      '14:00',
      '16:00'
    );
    expect(c2Result.allowed).toBe(true);

    // Parallel attempt reusing LAB-1: REJECTED (Room conflict)
    const badRoomResult = canSchedulePracticalGroup(
      'SEC-A',
      'C2',
      'FAC-202',
      'LAB-1',
      'WEDNESDAY',
      '14:00',
      '16:00'
    );
    expect(badRoomResult.allowed).toBe(false);
    expect(badRoomResult.reason).toBe('Room double booked');
  });
});
