import { describe, expect, it } from 'vitest';
import { rosterFileName, rosterToRows, toCsv } from './rosterCsv.js';

const roster = {
  courseId: 1,
  title: 'Full-Stack Web Engineering Quest',
  moduleCount: 2,
  learners: [
    {
      userId: 4,
      name: 'Mira, the Mage',
      email: 'mira@questlearn.dev',
      totalXp: 520,
      currentLevel: 3,
      streakDays: 7,
      clearedNodes: 1,
      moduleCount: 2,
      enrolledAt: '2026-10-27T16:03:24.180485Z',
      lastActivity: '2026-11-08T16:03:24.180485Z',
      nodes: [
        { moduleId: 1, title: 'HTML Foundations', status: 'COMPLETED', score: 100, attempts: 3 },
        { moduleId: 2, title: 'CSS "Layout" Magic', status: 'UNLOCKED', score: 0, attempts: 0 },
      ],
    },
  ],
};

describe('toCsv', () => {
  it('quotes values containing commas, quotes or newlines', () => {
    expect(
      toCsv([
        ['plain', 'has,comma'],
        ['say "hi"', 'two\nlines'],
      ]),
    ).toBe('plain,"has,comma"\r\n"say ""hi""","two\nlines"');
  });

  it('treats missing values as empty cells', () => {
    expect(toCsv([['a', null, undefined, 0]])).toBe('a,,,0');
  });
});

describe('rosterToRows', () => {
  it('puts one node column per node, after the learner columns', () => {
    const [header, row] = rosterToRows(roster);

    expect(header.slice(0, 4)).toEqual(['Learner', 'Email', 'XP', 'Level']);
    expect(header.slice(-2)).toEqual(['HTML Foundations', 'CSS "Layout" Magic']);
    expect(row[0]).toBe('Mira, the Mage');
    expect(row[7]).toBe(50);
    expect(row[8]).toBe('2026-10-27');
    expect(row.slice(-2)).toEqual(['Cleared 100% (3 tries)', 'Open']);
  });

  it('drops the attempt count when there was only one try', () => {
    const rows = rosterToRows({
      ...roster,
      learners: [
        {
          ...roster.learners[0],
          nodes: [
            { moduleId: 1, title: 'HTML Foundations', status: 'COMPLETED', score: 100, attempts: 1 },
            { moduleId: 2, title: 'CSS Layout Magic', status: 'LOCKED', score: 0, attempts: 0 },
          ],
        },
      ],
    });

    expect(rows[1].slice(-2)).toEqual(['Cleared 100%', 'Locked']);
  });

  it('keeps a course with no learners to just the header', () => {
    const rows = rosterToRows({ ...roster, learners: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(10);
  });
});

describe('rosterFileName', () => {
  it('slugifies the course title and stamps the date', () => {
    expect(rosterFileName(roster)).toMatch(
      /^full-stack-web-engineering-quest-roster-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  it('falls back when the course has no title', () => {
    expect(rosterFileName({})).toMatch(/^course-roster-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
