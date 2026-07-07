import { useEffect, useState } from 'react';
import * as authApi from '../api/auth.js';
import * as playersApi from '../api/players.js';
import * as seasonsApi from '../api/seasons.js';
import * as settingsApi from '../api/settings.js';
import type { Player, Season } from '../api/types.js';
import { errorMessage } from '../lib/format.js';

export default function SettingsPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [seasonLoaded, setSeasonLoaded] = useState(false);
  const [existingPlayers, setExistingPlayers] = useState<Player[]>([]);
  const [existingPlayersLoaded, setExistingPlayersLoaded] = useState(false);
  const [knsb, setKnsb] = useState<{ status: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newSeasonName, setNewSeasonName] = useState('');
  const [rosterText, setRosterText] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  function loadSeason() {
    seasonsApi
      .getCurrentSeason()
      .then(setSeason)
      .catch(() => setSeason(null))
      .finally(() => setSeasonLoaded(true));
  }

  useEffect(() => {
    loadSeason();
    settingsApi.getKnsbExportStatus().then(setKnsb).catch(() => {});
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

  async function handleWindowChange(value: number) {
    if (!season) return;
    const updated = await seasonsApi.updateSeasonSettings(season.id, { repeatPairingWindow: value });
    setSeason(updated);
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
    if (!newSeasonName.trim() || roster.length === 0) {
      setError('Season name and at least one roster line are required.');
      return;
    }
    try {
      await seasonsApi.createSeason({ name: newSeasonName.trim(), roster });
      setNewSeasonName('');
      setRosterText('');
      loadSeason();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleChangePassword() {
    setError(null);
    setNotice(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed. Other sessions have been signed out.');
    } catch (err) {
      setError(errorMessage(err));
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
                type="number"
                value={season.repeatPairingWindow}
                onChange={(e) => handleWindowChange(Number(e.target.value))}
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
              </div>
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
            <div className="help">Not configured yet — no light palette has been designed.</div>
          </div>
          <button className="switch" disabled style={{ opacity: 0.45, cursor: 'default' }} />
        </div>
        <div className="settings-row">
          <div style={{ width: '100%' }}>
            <div className="label">Admin password</div>
            <div className="help">Shared by all admins. Changing it signs out other sessions.</div>
            <div className="field-row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="current-password">Current</label>
                <input
                  id="current-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-password">New</label>
                <input
                  id="new-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <button type="button" className="link-add" style={{ marginTop: 0 }} onClick={() => setShowPasswords((v) => !v)}>
                {showPasswords ? 'Hide' : 'Show'}
              </button>
              <button className="btn btn-ghost" onClick={handleChangePassword} disabled={!currentPassword || !newPassword}>
                Change password
              </button>
            </div>
          </div>
        </div>

        <div className="section-label">KNSB export</div>
        <div className="settings-row">
          <div>
            <div className="label">Rapid rating export</div>
            <div className="help">{knsb?.message ?? 'Loading…'}</div>
          </div>
          <button className="btn btn-ghost" disabled style={{ opacity: 0.45, cursor: 'default' }}>
            Export…
          </button>
        </div>
      </div>
    </div>
  );
}
