import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import * as authApi from '../api/auth.js';
import * as backupApi from '../api/backup.js';
import * as playersApi from '../api/players.js';
import * as seasonsApi from '../api/seasons.js';
import * as settingsApi from '../api/settings.js';
import type { ClubSettings, Player, Round, Season } from '../api/types.js';
import CustomSelect from '../components/CustomSelect.js';
import Modal from '../components/Modal.js';
import PasswordVisibilityToggle from '../components/PasswordVisibilityToggle.js';
import { useTheme } from '../context/ThemeContext.js';
import { errorMessage, formatDate } from '../lib/format.js';

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [season, setSeason] = useState<Season | null>(null);
  const [seasonLoaded, setSeasonLoaded] = useState(false);
  const [existingPlayers, setExistingPlayers] = useState<Player[]>([]);
  const [existingPlayersLoaded, setExistingPlayersLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newSeasonName, setNewSeasonName] = useState('');
  const [topValueDraft, setTopValueDraft] = useState('');
  const [rosterText, setRosterText] = useState('');

  const [windowDraft, setWindowDraft] = useState('');
  const [byeCapDraft, setByeCapDraft] = useState('');

  const [clubSettings, setClubSettings] = useState<ClubSettings | null>(null);
  const [arbiterNameDraft, setArbiterNameDraft] = useState('');
  const [arbiterEmailDraft, setArbiterEmailDraft] = useState('');
  const [tournamentNameDraft, setTournamentNameDraft] = useState('');
  const [plannedEndDateDraft, setPlannedEndDateDraft] = useState('');
  const [showKnsbModal, setShowKnsbModal] = useState(false);
  const [knsbRounds, setKnsbRounds] = useState<Round[]>([]);
  const [knsbFromRound, setKnsbFromRound] = useState('');
  const [knsbThroughRound, setKnsbThroughRound] = useState('');
  const [knsbBusy, setKnsbBusy] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [showImportForm, setShowImportForm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadSeason() {
    seasonsApi
      .getCurrentSeason()
      .then((s) => {
        setSeason(s);
        setWindowDraft(String(s.repeatPairingWindow));
        setByeCapDraft(String(s.regularByeCap));
        setTournamentNameDraft(s.knsbTournamentName ?? '');
        setPlannedEndDateDraft(s.knsbPlannedEndDate ? s.knsbPlannedEndDate.slice(0, 10) : '');
      })
      .catch(() => setSeason(null))
      .finally(() => setSeasonLoaded(true));
  }

  useEffect(() => {
    loadSeason();
    settingsApi.getClubSettings().then((cs) => {
      setClubSettings(cs);
      setArbiterNameDraft(cs.defaultKnsbArbiterName ?? '');
      setArbiterEmailDraft(cs.defaultKnsbArbiterEmail ?? '');
      setTopValueDraft(String(cs.defaultTopValue));
    });
    playersApi
      .listPlayers()
      .then(setExistingPlayers)
      .catch(() => {})
      .finally(() => setExistingPlayersLoaded(true));
  }, []);

  async function handleToggleExternal() {
    if (!season) return;
    const updated = await seasonsApi.updateSeasonSettings(season.id, {
      countExternalMatches: !season.countExternalMatches,
    });
    setSeason(updated);
  }

  async function applyWindow() {
    if (!season) return;
    const value = Number(windowDraft);
    if (!Number.isFinite(value) || value < 0) {
      setWindowDraft(String(season.repeatPairingWindow));
      return;
    }
    const updated = await seasonsApi.updateSeasonSettings(season.id, { repeatPairingWindow: value });
    setSeason(updated);
    setWindowDraft(String(updated.repeatPairingWindow));
  }

  async function applyByeCap() {
    if (!season) return;
    const value = Number(byeCapDraft);
    if (!Number.isFinite(value) || value < 0) {
      setByeCapDraft(String(season.regularByeCap));
      return;
    }
    const updated = await seasonsApi.updateSeasonSettings(season.id, { regularByeCap: value });
    setSeason(updated);
    setByeCapDraft(String(updated.regularByeCap));
  }

  async function applyTournamentName() {
    if (!season) return;
    const value = tournamentNameDraft.trim();
    if (!value) {
      setTournamentNameDraft(season.knsbTournamentName ?? '');
      return;
    }
    const updated = await seasonsApi.updateSeasonSettings(season.id, { knsbTournamentName: value });
    setSeason(updated);
  }

  async function applyPlannedEndDate() {
    if (!season) return;
    const updated = await seasonsApi.updateSeasonSettings(season.id, {
      knsbPlannedEndDate: plannedEndDateDraft || null,
    });
    setSeason(updated);
  }

  async function applyArbiterName() {
    const value = arbiterNameDraft.trim();
    if (!value) return;
    const updated = await settingsApi.updateClubSettings({ defaultKnsbArbiterName: value });
    setClubSettings(updated);
  }

  async function applyArbiterEmail() {
    const value = arbiterEmailDraft.trim();
    if (!value) return;
    const updated = await settingsApi.updateClubSettings({ defaultKnsbArbiterEmail: value });
    setClubSettings(updated);
  }

  function openKnsbModal() {
    if (!season) return;
    setError(null);
    setKnsbFromRound('');
    setKnsbThroughRound('');
    seasonsApi.getAdminRounds(season.id).then((rounds) => {
      setKnsbRounds([...rounds].sort((a, b) => a.number - b.number));
    });
    setShowKnsbModal(true);
  }

  async function handleExportKnsb() {
    if (!season) return;
    const from = Number(knsbFromRound);
    const through = Number(knsbThroughRound);
    if (!Number.isFinite(from) || !Number.isFinite(through) || !knsbFromRound || !knsbThroughRound || through < from) {
      setError('Pick both a "from" and "through" round (from ≤ through).');
      return;
    }
    setError(null);
    setKnsbBusy(true);
    try {
      const { content, filename } = await settingsApi.getKnsbExport(season.id, from, through);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setShowKnsbModal(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKnsbBusy(false);
    }
  }

  async function handleEndSeason() {
    if (!season) return;
    if (!window.confirm(`End "${season.name}"? It becomes read-only and a new season can then be started.`)) return;
    await seasonsApi.endSeason(season.id);
    loadSeason();
  }

  async function handleStartSeason() {
    setError(null);
    // Reuse an existing player by name (case-insensitive) if one exists —
    // otherwise this silently creates a duplicate identity instead of
    // enrolling the player the admin already added on the Players page.
    const roster = rosterText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, value] = line.split(',').map((s) => s.trim());
        const existing = existingPlayers.find((p) => p.name.toLowerCase() === name!.toLowerCase());
        return existing
          ? { playerId: existing.id, startingValue: Number(value) || 0 }
          : { newPlayerName: name!, startingValue: Number(value) || 0 };
      });
    const topValue = Number(topValueDraft);
    if (!newSeasonName.trim() || roster.length === 0 || !Number.isFinite(topValue) || topValue <= 0) {
      setError('Season name, a top value, and at least one roster line are required.');
      return;
    }
    try {
      await seasonsApi.createSeason({ name: newSeasonName.trim(), topValue, roster });
      setNewSeasonName('');
      setRosterText('');
      loadSeason();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function resetPasswordForm() {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleChangePassword() {
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    try {
      await authApi.changePassword(currentPassword, newPassword);
      resetPasswordForm();
      setNotice('Password changed. Other sessions have been signed out.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const canSavePassword = currentPassword && newPassword && confirmPassword;

  async function handleExportBackup() {
    if (!season) return;
    setError(null);
    try {
      const data = await backupApi.exportBackup(season.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = season.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const now = new Date();
      const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((n) => String(n).padStart(2, '0'))
        .join('-') +
        '-' +
        [now.getHours(), now.getMinutes()].map((n) => String(n).padStart(2, '0')).join('');
      a.href = url;
      a.download = `${slug || 'season'}-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleImportBackup() {
    if (!importFile || !season) return;
    setError(null);
    setNotice(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await importFile.text());
    } catch {
      setError('That file is not valid JSON.');
      return;
    }
    if (
      !window.confirm(
        `Replace the current season "${season.name}" with this backup? Everything currently in it will be gone — this can't be undone.`,
      )
    ) {
      return;
    }
    setImportBusy(true);
    try {
      await backupApi.importBackupReplace(season.id, parsed);
      setNotice('Backup imported.');
      setImportFile(null);
      setShowImportForm(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadSeason();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin · Settings</h1>
      {error && <div className="error-banner">{error}</div>}
      {notice && <p style={{ color: 'var(--win)', fontSize: 13 }}>{notice}</p>}

      <div className="card">
        <div className="section-label">Competition rules</div>
        {seasonLoaded && season ? (
          <>
            <div className="settings-row">
              <div>
                <div className="label">Count external matches toward internal standings</div>
                <div className="help">Applies the 75/50/25% own-value bonus for players in a clashing external match.</div>
              </div>
              <button
                className={season.countExternalMatches ? 'switch on' : 'switch'}
                onClick={handleToggleExternal}
                aria-label="Toggle counting external matches"
              />
            </div>
            <div className="settings-row">
              <div>
                <div className="label">Repeat-pairing avoidance window</div>
                <div className="help">Rounds that must pass before two players can be paired again.</div>
              </div>
              <input
                className="settings-num"
                type="text"
                inputMode="numeric"
                value={windowDraft}
                onChange={(e) => setWindowDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={applyWindow}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </div>
            <div className="settings-row">
              <div>
                <div className="label">Regular bye cap</div>
                <div className="help">Max regular byes an absent player can rack up in a season.</div>
              </div>
              <input
                className="settings-num"
                type="text"
                inputMode="numeric"
                value={byeCapDraft}
                onChange={(e) => setByeCapDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={applyByeCap}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </div>
          </>
        ) : (
          seasonLoaded && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active season — settings apply once one exists.</p>
        )}

        <div className="section-label">Season</div>
        {seasonLoaded && season ? (
          <div className="settings-row">
            <div>
              <div className="label">{season.name}</div>
              <div className="help">Started {new Date(season.startedAt).toLocaleDateString()}</div>
            </div>
            <button className="btn btn-ghost" onClick={handleEndSeason}>
              End season &amp; start new →
            </button>
          </div>
        ) : (
          seasonLoaded && (
            <div style={{ paddingTop: 8 }}>
              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="season-name">New season name</label>
                  <input id="season-name" style={{ width: '100%' }} value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="top-value">Top value</label>
                  <input
                    id="top-value"
                    className="settings-num"
                    type="text"
                    inputMode="numeric"
                    value={topValueDraft}
                    onChange={(e) => setTopValueDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -8, marginBottom: 14 }}>
                Value assigned to rank 1 each round — the whole season's point scale. Defaults to the club default
                ({clubSettings?.defaultTopValue ?? '…'}) and can't be changed once the season starts.
              </p>
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="roster">Roster — one per line: Name, starting value</label>
                <textarea
                  id="roster"
                  rows={5}
                  value={rosterText}
                  onChange={(e) => setRosterText(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    color: 'var(--text)',
                    padding: 10,
                  }}
                />
              </div>
              <button className="btn btn-primary" onClick={handleStartSeason} disabled={!existingPlayersLoaded}>
                {existingPlayersLoaded ? 'Start season' : 'Loading players…'}
              </button>
            </div>
          )
        )}

        <div className="section-label">Site</div>
        <div className="settings-row">
          <div>
            <div className="label">Light mode</div>
            <div className="help">Switches the whole site's palette — applies immediately, remembered on this device.</div>
          </div>
          <button
            className={theme === 'light' ? 'switch on' : 'switch'}
            onClick={toggleTheme}
            aria-pressed={theme === 'light'}
            aria-label="Toggle light mode"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Admin password</div>
            <div className="help">Shared by all admins. Changing it signs out other sessions.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setShowPasswordForm((v) => !v)}>
            Change password
          </button>
        </div>
        {showPasswordForm && (
          <div style={{ marginTop: -6, marginBottom: 8 }}>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="current-password">Current</label>
                <div className="password-field-wrap">
                  <input
                    id="current-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoFocus
                  />
                  <PasswordVisibilityToggle visible={showPasswords} onToggle={() => setShowPasswords((v) => !v)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="new-password">New</label>
                <div className="password-field-wrap">
                  <input
                    id="new-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirm-password">Confirm new</label>
                <div className="password-field-wrap">
                  <input
                    id="confirm-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canSavePassword && handleChangePassword()}
                  />
                </div>
              </div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleChangePassword} disabled={!canSavePassword}>
                Save new password
              </button>
              <button className="btn btn-ghost" onClick={resetPasswordForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="section-label">Backup</div>
        <div className="settings-row">
          <div>
            <div className="label">Export this season</div>
            <div className="help">Everything — players, rounds, results — as one JSON file you can keep or hand off.</div>
          </div>
          <button className="btn btn-ghost" onClick={handleExportBackup} disabled={!season}>
            Export backup
          </button>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Replace with a backup</div>
            <div className="help">Restore the current season from a previously exported file.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setShowImportForm((v) => !v)} disabled={!season}>
            Replace with backup…
          </button>
        </div>
        {showImportForm && (
          <div style={{ marginTop: -6, marginBottom: 8 }}>
            <div className="field-row" style={{ alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              <button className="btn btn-primary" onClick={handleImportBackup} disabled={!importFile || importBusy}>
                Replace current season
              </button>
              <button className="btn btn-ghost" onClick={() => setShowImportForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="section-label">KNSB export</div>
        <div className="settings-row">
          <div>
            <div className="label">Rapid rating export</div>
            <div className="help">Submit a batch of rounds to the KNSB rating list.</div>
          </div>
          <button className="btn btn-ghost" onClick={openKnsbModal} disabled={!season}>
            Export…
          </button>
        </div>
      </div>

      {showKnsbModal && season && (
        <Modal title="KNSB rating export" onClose={() => setShowKnsbModal(false)}>
          <div className="field">
            <label htmlFor="knsb-arbiter-name">Arbiter name</label>
            <input
              id="knsb-arbiter-name"
              value={arbiterNameDraft}
              onChange={(e) => setArbiterNameDraft(e.target.value)}
              onBlur={applyArbiterName}
              placeholder={clubSettings ? 'Not set' : 'Loading…'}
            />
          </div>
          <div className="field">
            <label htmlFor="knsb-arbiter-email">Arbiter email</label>
            <input
              id="knsb-arbiter-email"
              value={arbiterEmailDraft}
              onChange={(e) => setArbiterEmailDraft(e.target.value)}
              onBlur={applyArbiterEmail}
              placeholder={clubSettings ? 'Not set' : 'Loading…'}
            />
          </div>
          <div className="field">
            <label htmlFor="knsb-tournament-name">Tournament name</label>
            <input
              id="knsb-tournament-name"
              value={tournamentNameDraft}
              onChange={(e) => setTournamentNameDraft(e.target.value)}
              onBlur={applyTournamentName}
            />
          </div>
          <div className="field">
            <label htmlFor="knsb-end-date">Planned end date</label>
            <input
              id="knsb-end-date"
              type="date"
              value={plannedEndDateDraft}
              onChange={(e) => setPlannedEndDateDraft(e.target.value)}
              onBlur={applyPlannedEndDate}
            />
          </div>
          <div className="field-row" style={{ marginBottom: 0 }}>
            <div className="field">
              <label>From round</label>
              <CustomSelect
                value={knsbFromRound}
                options={[
                  { value: '', label: 'Select…' },
                  ...knsbRounds.map((r) => ({ value: String(r.number), label: `Round ${r.number} — ${formatDate(r.date)}` })),
                ]}
                onChange={(v) => {
                  setKnsbFromRound(v);
                  // Rounds can only be added in order — clear "through" if it's no longer valid.
                  if (v && knsbThroughRound && Number(knsbThroughRound) < Number(v)) setKnsbThroughRound('');
                }}
                triggerClassName="roster-select"
              />
            </div>
            <div className="field">
              <label>Through round</label>
              <CustomSelect
                value={knsbThroughRound}
                options={[
                  { value: '', label: 'Select…' },
                  ...knsbRounds
                    .filter((r) => !knsbFromRound || r.number >= Number(knsbFromRound))
                    .map((r) => ({ value: String(r.number), label: `Round ${r.number} — ${formatDate(r.date)}` })),
                ]}
                onChange={setKnsbThroughRound}
                triggerClassName="roster-select"
              />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleExportKnsb} disabled={knsbBusy} style={{ marginTop: 4 }}>
            {knsbBusy ? 'Exporting…' : 'Export'}
          </button>
        </Modal>
      )}

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Link to="/admin/activity-log" style={{ fontSize: 11, color: 'var(--muted)' }}>
          Activity log
        </Link>
      </div>
    </div>
  );
}
