import { useEffect, useState } from 'react';
import * as actionLogApi from '../api/actionlog.js';
import type { ActionLogEntry } from '../api/actionlog.js';
import { errorMessage } from '../lib/format.js';

const PAGE_SIZE = 50;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actionLogApi
      .listActions({ limit: PAGE_SIZE })
      .then((data) => {
        setEntries(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const data = await actionLogApi.listActions({ limit: PAGE_SIZE, beforeId: last.id });
      setEntries((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin · Activity log</h1>
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <div className="card" style={{ padding: '16px 22px 6px' }}>
          <table className="roster">
            <thead>
              <tr>
                <th style={{ width: 170 }}>When</th>
                <th style={{ width: 140 }}>Who</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                    {formatTimestamp(e.createdAt)}
                  </td>
                  <td>{e.actorName ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td>{e.summary}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)' }}>
                    No admin actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hasMore && (
            <div style={{ padding: '14px 0' }}>
              <button className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
