import { useRef, useState } from 'react';
import { Trash2, ImagePlus } from 'lucide-react';
import { authFetch } from '@/shared/lib/api';

/**
 * Small (96×96) clickable / drop target for a step's reference photo.
 * - With no photo: shows a hatched placeholder + "Add photo" hint
 * - With a photo: shows the signed-URL thumbnail with a delete affordance
 *
 * On upload/delete it calls `onChange(updatedStep)` so the parent can refresh
 * its local state without re-fetching the whole list.
 */
export default function ReferencePhotoSlot({ step, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);

  async function upload(file) {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await authFetch(`/api/build-steps/${step.id}/reference-photo`, {
        method: 'POST', body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }
      const updated = await res.json();
      onChange(updated);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setUploading(true); setError(null);
    try {
      const res = await authFetch(`/api/build-steps/${step.id}/reference-photo`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }
      const updated = await res.json();
      onChange(updated);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) upload(file);
  }

  const hasPhoto = !!step.reference_photo_key;
  const url = step.reference_photo_url;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        aria-label={hasPhoto ? 'Replace reference photo' : 'Add reference photo'}
        title={hasPhoto ? 'Click or drop to replace · drag-and-drop supported' : 'Click or drop an image to attach'}
        style={{
          width: 96, height: 96,
          border: '1px solid ' + (dragOver ? 'var(--m5-yellow)' : 'var(--m5-rule)'),
          background: hasPhoto
            ? 'var(--m5-cream)'
            : 'repeating-linear-gradient(135deg, var(--m5-cream-deep) 0 12px, transparent 12px 24px), var(--m5-cream)',
          position: 'relative',
          cursor: uploading ? 'progress' : 'pointer',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {hasPhoto && url && (
          <img
            src={url}
            alt={`Reference for ${step.title || 'this step'}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setError(new Error('Failed to load reference photo'))}
          />
        )}
        {!hasPhoto && !uploading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--m5-muted)',
            fontFamily: 'var(--m5-font-mono)',
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            gap: 4,
          }}>
            <ImagePlus size={16} />
            Add photo
          </div>
        )}
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(250,247,238,0.85)',
            color: 'var(--m5-ink)',
            fontFamily: 'var(--m5-font-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}>
            Uploading…
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => upload(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </div>
      {hasPhoto && (
        <button
          onClick={remove}
          aria-label="Remove reference photo"
          title="Remove reference photo"
          style={{
            padding: '2px 6px',
            border: '1px solid var(--m5-rule)',
            background: 'transparent',
            color: 'var(--m5-muted)',
            fontFamily: 'var(--m5-font-mono)',
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            borderRadius: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Trash2 size={11} /> Remove
        </button>
      )}
      {error && (
        <span style={{
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 9.5,
          color: '#c83a3a',
          maxWidth: 120,
          textAlign: 'right',
        }} title={error.message}>
          {error.message.slice(0, 28)}{error.message.length > 28 ? '…' : ''}
        </span>
      )}
    </div>
  );
}
