import * as xlsx from 'xlsx';
import * as path from 'path';

/**
 * Generates the authentic "BCA (V-C).xlsx" timetable fixture matching all prompt specifications.
 */
export function generateBCAWorkbook(): Buffer {
  const wb = xlsx.utils.book_new();

  const data: any[][] = [
    ['DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'],
    ['ACADEMIC SESSION: AUGUST 2026 - JANUARY 2027'],
    ['TIME TABLE: BCA - 5th SEMESTER (SECTION C)'],
    ['Effective Date: 04/08/2026', '', '', '', 'Class Coordinator: Dr. Neha Dave'],
    [
      'Day',
      'Period 1\n(09:00 - 09:55)',
      'Period 2\n(09:55 - 10:50)',
      'Period 3\n(10:50 - 11:45)',
      'Period 4\n(11:45 - 12:40)',
      'Lunch Break\n(12:40 - 13:30)',
      'Period 5\n(13:30 - 14:25)',
      'Period 6\n(14:25 - 15:20)',
      'Period 7\n(15:20 - 16:15)',
    ],
    [
      'MONDAY',
      'BCA-501 (SS)\nR-204',
      'BCA-502 (ND)\nR-204',
      'BCA-503 (Shiv P)\nR-204',
      'BCA-504 (Sanjay K)\nR-204',
      'LUNCH',
      'C1: Lab 3 (ND)\nC2: Lab 4 (Shiv P)',
      'C1: Lab 3 (ND)\nC2: Lab 4 (Shiv P)',
      'Mentoring / Remedial (SS)',
    ],
    [
      'TUESDAY',
      'BCA-503 (Shiv P)\nR-204',
      'BCA-501 (SS)\nR-204',
      'BCA-504 (Sanjay K)\nR-204',
      'BCA-502 (ND)\nR-204',
      'LUNCH',
      'C1: Lab 4 (Shiv P)\nC2: Lab 3 (ND)',
      'C1: Lab 4 (Shiv P)\nC2: Lab 3 (ND)',
      'Library / Self Study',
    ],
    [
      'WEDNESDAY',
      'BCA-502 (ND)\nR-204',
      'BCA-503 (Shiv P)\nR-204',
      'BCA-501 (SS)\nR-204',
      'BCA-505 (F2)\nR-204', // F2: unmapped faculty abbreviation test case
      'LUNCH',
      'BCA-504 (Sanjay K)\nR-204',
      'Placement Training (SS)\nLH-101',
      'Placement Training (SS)\nLH-101',
    ],
    [
      'THURSDAY',
      'BCA-504 (Sanjay K)\nR-204',
      'BCA-505 (F2)\nR-204',
      'BCA-502 (ND)\nR-204',
      'BCA-501 (SS)\nR-204',
      'LUNCH',
      'C1: Web Lab (Sanjay K)\nC2: Project Lab (F3)', // F3: unmapped faculty abbreviation
      'C1: Web Lab (Sanjay K)\nC2: Project Lab (F3)',
      'Seminar / Activity',
    ],
    [
      'FRIDAY',
      'BCA-501 (SS)\nR-204',
      'BCA-502 (ND)\nR-204',
      'BCA-503 (Shiv P)\nR-204',
      'BCA-504 (Sanjay K)\nR-204',
      'LUNCH',
      'Mini Project Guidance (Shiv P)\nLab 3',
      'Mini Project Guidance (Shiv P)\nLab 3',
      'Sports & Cultural',
    ],
    [
      'SATURDAY',
      'BCA-505 (F2)\nR-204',
      'BCA-503 (Shiv P)\nR-204',
      'BCA-502 (ND)\nR-204',
      'Technical Communication (SS)\nR-204',
      'LUNCH',
      'Remedial / Doubt Clearing (Sanjay K)',
      'Student Club Activities',
      '-',
    ],
  ];

  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, 'BCA V-C');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Write file directly to project root as BCA (V-C).xlsx for test availability
if (require.main === module) {
  const buf = generateBCAWorkbook();
  const targetPath = path.resolve(__dirname, '../../BCA (V-C).xlsx');
  xlsx.writeFile(xlsx.read(buf, { type: 'buffer' }), targetPath);
  console.log(`[FIXTURE_GENERATED] ${targetPath}`);
}
