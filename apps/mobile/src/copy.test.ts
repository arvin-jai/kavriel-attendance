import { copy } from './copy';

describe('copy', () => {
  it('never lets an unfinished check-in sound saved', () => {
    for (const text of [copy.scan.sendingText, copy.scan.checkingText, copy.scan.slowText]) {
      expect(text).toMatch(/not saved yet/i);
    }
    expect(copy.scan.failureTitle).toMatch(/not checked in/i);
  });

  it('uses singular and plural correctly when ending attendance', () => {
    expect(copy.qr.endPending(1)).toMatch(/^1 student hasn't/);
    expect(copy.qr.endPending(5)).toMatch(/^5 students haven't/);
  });
});
