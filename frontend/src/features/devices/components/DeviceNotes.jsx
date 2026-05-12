import { useCallback, useEffect, useState } from 'react';
import { Send, Pencil, Trash2, X, Check } from 'lucide-react';
import { authFetch } from '@/shared/lib/api';
import { formatRelativeTime } from '@/features/audit/utils/relativeTime';

/**
 * Per-device user-attributed notes feed. Renders newest-first. Anyone may
 * read; admin/technician may add. Authors may edit/delete their own; admins
 * may delete any.
 */
export default function DeviceNotes({ deviceId, currentUser }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [composer, setComposer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const canPost = currentUser?.role === 'admin' || currentUser?.role === 'technician';

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/devices/${deviceId}/notes`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setNotes(await res.json());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  async function submitComposer() {
    const body = composer.trim();
    if (!body || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await authFetch(`/api/devices/${deviceId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `${res.status} ${res.statusText}`);
      }
      const created = await res.json();
      setNotes((prev) => [created, ...prev]);
      setComposer('');
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(noteId) {
    const body = editDraft.trim();
    if (!body) return;
    try {
      const res = await authFetch(`/api/device-notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `${res.status} ${res.statusText}`);
      }
      const updated = await res.json();
      setNotes((prev) => prev.map((n) => n.id === noteId ? updated : n));
      setEditingId(null);
    } catch (e) {
      setError(e);
    }
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await authFetch(`/api/device-notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `${res.status} ${res.statusText}`);
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="sec notes-sec">
      <div className="sh">
        <h3>
          <span className="yb" />
          Notes
        </h3>
        {!loading && notes.length > 0 && (
          <span className="sub">{notes.length} note{notes.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {canPost && (
        <div className="note-composer">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submitComposer();
              }
            }}
            placeholder="Leave a note for the next tech — Cmd/Ctrl+Enter to post."
            rows={2}
            disabled={submitting}
          />
          <button
            type="button"
            className="note-submit"
            onClick={submitComposer}
            disabled={!composer.trim() || submitting}
          >
            <Send size={13} />
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      )}

      {error && (
        <div className="note-error">
          {error.message}
        </div>
      )}

      {loading ? (
        <div className="note-empty">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="note-empty">
          {canPost ? 'No notes yet — be the first.' : 'No notes recorded.'}
        </div>
      ) : (
        <ul className="note-list">
          {notes.map((n) => {
            const mine = n.author?.id && n.author.id === currentUser?.id;
            const canEdit = mine;
            const canDelete = mine || currentUser?.role === 'admin';
            const isEditing = editingId === n.id;
            return (
              <li key={n.id} className={`note-item${mine ? ' is-mine' : ''}`}>
                <header>
                  <Avatar name={n.author?.name || n.author?.email || 'Unknown'} picture={n.author?.picture} />
                  <div className="byline">
                    <span className="author">{n.author?.name || n.author?.email || 'Unknown'}</span>
                    {mine && <span className="me-tag">You</span>}
                    <span className="time" title={n.created_at}>{formatRelativeTime(n.created_at)}</span>
                    {n.updated_at !== n.created_at && (
                      <span className="edited" title={n.updated_at}>· edited</span>
                    )}
                  </div>
                  {!isEditing && (canEdit || canDelete) && (
                    <div className="actions">
                      {canEdit && (
                        <button
                          type="button"
                          aria-label="Edit note"
                          title="Edit"
                          onClick={() => { setEditingId(n.id); setEditDraft(n.body); }}
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="danger"
                          aria-label="Delete note"
                          title="Delete"
                          onClick={() => deleteNote(n.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </header>
                {isEditing ? (
                  <div className="edit-row">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="edit-actions">
                      <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X size={12} /> Cancel
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => saveEdit(n.id)}
                        disabled={!editDraft.trim()}
                      >
                        <Check size={12} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="body">{n.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Avatar({ name, picture }) {
  const initials = (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return picture ? (
    <img className="note-avatar" src={picture} alt="" />
  ) : (
    <span className="note-avatar fallback" aria-hidden="true">{initials}</span>
  );
}
