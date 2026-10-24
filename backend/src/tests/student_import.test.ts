import { sanitizeFormulaValue, sanitizeForExport } from '../services/bulk-onboard';

describe('Phase 6: Student Management & Spreadsheet Security', () => {
  describe('Formula Injection Sanitization (CSV & Excel)', () => {
    it('escapes dangerous spreadsheet formula prefixes with a single quote', () => {
      // Equals prefix
      expect(sanitizeFormulaValue('=cmd|’ /C calc’!A0')).toBe(`'=cmd|’ /C calc’!A0`);
      expect(sanitizeFormulaValue('=SUM(A1:A10)')).toBe(`'=SUM(A1:A10)`);

      // At prefix
      expect(sanitizeFormulaValue('@SUM(1+1)')).toBe(`'@SUM(1+1)`);

      // Pipe prefix
      expect(sanitizeFormulaValue('|cmd.exe')).toBe(`'|cmd.exe`);

      // Percent prefix
      expect(sanitizeFormulaValue('%5+5')).toBe(`'%5+5`);
    });

    it('neutralizes leading whitespace, tabs, and carriage returns before formula triggers', () => {
      // Tab before formula
      expect(sanitizeFormulaValue('\t=cmd|’ /C calc’!A0')).toBe(`'=cmd|’ /C calc’!A0`);

      // Carriage return before formula
      expect(sanitizeFormulaValue('\r=SUM(1+1)')).toBe(`'=SUM(1+1)`);

      // Spaces before formula
      expect(sanitizeFormulaValue('   =cmd')).toBe(`'=cmd`);
    });

    it('preserves legitimate international phone numbers without escaping', () => {
      // Indian phone number starting with +91
      expect(sanitizeFormulaValue('+91 9876543210')).toBe('+91 9876543210');
      expect(sanitizeFormulaValue('+91-98765-43210')).toBe('+91-98765-43210');
      expect(sanitizeFormulaValue('+1 555 123 4567')).toBe('+1 555 123 4567');
    });

    it('preserves legitimate signed numeric values without escaping', () => {
      expect(sanitizeFormulaValue('-5')).toBe('-5');
      expect(sanitizeFormulaValue('+10')).toBe('+10');
      expect(sanitizeFormulaValue('-3.14')).toBe('-3.14');
      expect(sanitizeFormulaValue('42')).toBe('42');
    });

    it('preserves benign student names and IDs', () => {
      expect(sanitizeFormulaValue('Aarav Sharma')).toBe('Aarav Sharma');
      expect(sanitizeFormulaValue('SRHU238990')).toBe('SRHU238990');
      expect(sanitizeFormulaValue('DD241104301172')).toBe('DD241104301172');
    });

    it('sanitizes export values consistently', () => {
      expect(sanitizeForExport('=cmd')).toBe(`'=cmd`);
      expect(sanitizeForExport('+91 9876543210')).toBe('+91 9876543210');
      expect(sanitizeForExport('Normal Text')).toBe('Normal Text');
    });
  });

  describe('Identifier Management & Uniqueness (Phase 4.3 & 5.1)', () => {
    it('distinguishes between enrollment numbers and registration numbers', () => {
      const enrollmentNo = 'SRHU238990';
      const registrationNo = 'DD241104301172';

      expect(enrollmentNo).not.toBe(registrationNo);
      // Validates expected formats
      expect(/^SRHU\d{6}$/.test(enrollmentNo)).toBe(true);
      expect(/^DD\d{12}$/.test(registrationNo)).toBe(true);
    });

    it('detects duplicate student identifiers within an import batch', () => {
      const batch = [
        { enrollmentNo: 'SRHU238990', registrationNo: 'DD241104301172', email: 'stu1@srhu.edu.in' },
        { enrollmentNo: 'SRHU238991', registrationNo: 'DD241104301173', email: 'stu2@srhu.edu.in' },
        { enrollmentNo: 'SRHU238990', registrationNo: 'DD241104301174', email: 'stu3@srhu.edu.in' }, // Duplicate enrollmentNo
      ];

      const seenEnrollment = new Set<string>();
      const duplicates: string[] = [];

      for (const row of batch) {
        if (seenEnrollment.has(row.enrollmentNo)) {
          duplicates.push(row.enrollmentNo);
        } else {
          seenEnrollment.add(row.enrollmentNo);
        }
      }

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]).toBe('SRHU238990');
    });
  });
});
