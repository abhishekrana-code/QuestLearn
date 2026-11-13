/**
 * Turns a roster into the rows of a spreadsheet.
 *
 * Kept separate from the page so the column layout and escaping can be tested
 * without a browser: a CSV that mangles a comma in a course or learner name is
 * worse than no export at all.
 */

/** RFC 4180: wrap in quotes when the value could break the row, doubling quotes. */
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

export function rosterFileName(roster) {
  const slug =
    (roster?.title ?? 'course')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'course';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-roster-${stamp}.csv`;
}

/**
 * One header row plus one row per learner.
 *
 * <p>Node columns carry the title the teacher wrote, so the sheet reads like the
 * skill tree they built instead of a wall of ids.</p>
 */
export function rosterToRows(roster) {
  const learners = roster?.learners ?? [];
  const nodeTitles = learners[0]?.nodes?.map((node) => node.title) ?? [];
  const header = [
    'Learner',
    'Email',
    'XP',
    'Level',
    'Streak (days)',
    'Nodes cleared',
    'Nodes',
    'Completion %',
    'Enrolled',
    'Last activity',
    ...nodeTitles,
  ];

  const rows = learners.map((learner) => {
    const percent =
      learner.moduleCount > 0
        ? Math.round((learner.clearedNodes / learner.moduleCount) * 100)
        : 0;
    const nodeCells = (learner.nodes ?? []).map((node) => {
      if (node.status === 'COMPLETED') {
        return `Cleared ${node.score}%${node.attempts > 1 ? ` (${node.attempts} tries)` : ''}`;
      }
      return node.status === 'UNLOCKED' ? 'Open' : 'Locked';
    });
    return [
      learner.name,
      learner.email,
      learner.totalXp,
      learner.currentLevel,
      learner.streakDays,
      learner.clearedNodes,
      learner.moduleCount,
      percent,
      (learner.enrolledAt ?? '').slice(0, 10),
      (learner.lastActivity ?? '').slice(0, 10),
      ...nodeCells,
    ];
  });

  return [header, ...rows];
}
