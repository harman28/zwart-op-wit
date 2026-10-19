import { describe, expect, it } from 'vitest';
import { describeAction } from '../describeAction.js';

describe('describeAction — player PATCH', () => {
  const before = { name: 'Vincent', membershipType: 'FULL', notes: 'plays Tuesdays' };

  it('names only the fields that actually changed', () => {
    const summary = describeAction(
      'PATCH',
      '/api/admin/players/391',
      { name: 'Vincent', membershipType: 'INTERNAL_ONLY', notes: 'plays Tuesdays' },
      { playerName: 'Vincent', playerBefore: before },
    );
    expect(summary).toBe('Updated "Vincent": membership set to INTERNAL_ONLY');
  });

  it('reports no changes when the submitted form matches the existing row exactly', () => {
    const summary = describeAction(
      'PATCH',
      '/api/admin/players/391',
      { name: 'Vincent', membershipType: 'FULL', notes: 'plays Tuesdays' },
      { playerName: 'Vincent', playerBefore: before },
    );
    expect(summary).toBe('Updated "Vincent" (no changes)');
  });

  it('still reports a real rename', () => {
    const summary = describeAction(
      'PATCH',
      '/api/admin/players/391',
      { name: 'Vince', membershipType: 'FULL', notes: 'plays Tuesdays' },
      { playerName: 'Vincent', playerBefore: before },
    );
    expect(summary).toBe('Updated "Vincent": renamed to "Vince"');
  });

  it('falls back to naming every submitted field when there is no before-state to diff against', () => {
    const summary = describeAction(
      'PATCH',
      '/api/admin/players/391',
      { name: 'Vincent', membershipType: 'FULL' },
      { playerName: 'Vincent' },
    );
    expect(summary).toBe('Updated "Vincent": renamed to "Vincent", membership set to FULL');
  });
});

describe('describeAction — season roster enrollment', () => {
  it('describes enrolling a player instead of falling back to the raw route', () => {
    const summary = describeAction('POST', '/api/admin/seasons/57/players', { name: 'Vincent', membershipType: 'FULL' }, { seasonName: 'Season 14' });
    expect(summary).toBe('Enrolled "Vincent" in "Season 14"');
  });

  it('falls back to the season id when the name could not be resolved', () => {
    const summary = describeAction('POST', '/api/admin/seasons/57/players', { name: 'Vincent' }, {});
    expect(summary).toBe('Enrolled "Vincent" in #57');
  });
});
