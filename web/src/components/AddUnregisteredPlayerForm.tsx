import { useState } from 'react';
import type { MembershipType } from '../api/types.js';
import { MEMBERSHIP_OPTIONS } from '../lib/membership.js';
import CustomSelect from './CustomSelect.js';

interface Props {
  onSubmit: (input: { name: string; membershipType: MembershipType; startingValue: number }) => void;
  onCancel: () => void;
  submitLabel?: string;
}

/** Inline form for creating a brand-new, not-yet-in-the-Players-list player —
 * used both to give the odd-one-out an opponent and to add a matchup from
 * scratch. Always defaults to GUEST, same reasoning as everywhere else this
 * shape appears: an admin who hasn't classified them yet shouldn't have them
 * silently counted as a full member. */
export default function AddUnregisteredPlayerForm({ onSubmit, onCancel, submitLabel = 'Add' }: Props) {
  const [name, setName] = useState('');
  const [membershipType, setMembershipType] = useState<MembershipType>('GUEST');
  const [startingValue, setStartingValue] = useState('100');

  function submit() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), membershipType, startingValue: Number(startingValue) || 0 });
  }

  return (
    <div className="field-row" style={{ alignItems: 'flex-end' }}>
      <div className="field">
        <label htmlFor="unreg-name">Name</label>
        <input
          id="unreg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
      </div>
      <div className="field">
        <label>Membership</label>
        <CustomSelect
          value={membershipType}
          options={MEMBERSHIP_OPTIONS}
          onChange={(v) => setMembershipType(v as MembershipType)}
          triggerClassName="roster-select"
        />
      </div>
      <div className="field">
        <label htmlFor="unreg-value">Starting value</label>
        <input
          id="unreg-value"
          type="text"
          inputMode="numeric"
          style={{ minWidth: 80 }}
          value={startingValue}
          onChange={(e) => setStartingValue(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <button className="btn btn-primary" onClick={submit}>
        {submitLabel}
      </button>
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
