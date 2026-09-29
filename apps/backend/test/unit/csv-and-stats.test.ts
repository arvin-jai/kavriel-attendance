import { attendancePercentage } from '@kavriel/shared';
import { describe, expect, it } from 'vitest';

import { csvCell, toCsv } from '../../src/modules/reports/csv';

describe('CSV', () => {
  it('quotes separators and quotes', () => {
    expect(csvCell('Dela Cruz, Juan')).toBe('"Dela Cruz, Juan"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(92.5)).toBe('92.5');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes a BOM and CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x\r\n');
  });
});

describe('attendancePercentage', () => {
  it('counts late as attended and excludes excused', () => {
    expect(attendancePercentage({ PRESENT: 7, LATE: 1, ABSENT: 2, EXCUSED: 5 })).toBe(80);
  });
  it('is null when nothing counts', () => {
    expect(attendancePercentage({ PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 3 })).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(attendancePercentage({ PRESENT: 2, LATE: 0, ABSENT: 1, EXCUSED: 0 })).toBe(66.7);
  });
});
