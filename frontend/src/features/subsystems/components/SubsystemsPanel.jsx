import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import {
  primaryBtn,
  dangerBtn,
  productTabBtn,
  PRODUCT_TYPES,
} from '@/shared/lib/m5-styles';

export default function SubsystemsPanel() {
  const [subsystemTab, setSubsystemTab] = useState('AEMS');
  const [subsystems, setSubsystems] = useState([]);
  const [newSubsystemName, setNewSubsystemName] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

  async function loadSubsystems() {
    const res = await fetch('/api/subsystems', { credentials: 'include' });
    if (res.ok) setSubsystems(await res.json());
  }

  useEffect(() => {
    loadSubsystems();
  }, []);

  const filteredSubsystems = subsystems
    .filter((s) => s.product_type === subsystemTab)
    .sort((a, b) => a.sort_order - b.sort_order);

  async function handleAddSubsystem() {
    if (!newSubsystemName.trim()) return;
    const res = await fetch('/api/subsystems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ product_type: subsystemTab, name: newSubsystemName.trim() }),
    });
    if (res.ok) {
      setNewSubsystemName('');
      loadSubsystems();
    }
  }

  async function handleDeleteSubsystem(subsystemId) {
    if (!confirm('Delete this subsystem? This cannot be undone.')) return;
    const res = await fetch(`/api/subsystems/${subsystemId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      loadSubsystems();
    } else {
      const data = await res.json();
      alert(data.detail || 'Failed to delete subsystem');
    }
  }

  return (
    <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', maxWidth: 680 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--m5-rule)' }}>
        {PRODUCT_TYPES.map((type, idx) => (
          <button
            key={type}
            onClick={() => setSubsystemTab(type)}
            style={{
              ...productTabBtn(type, subsystemTab),
              borderRight: idx === PRODUCT_TYPES.length - 1 ? '1px solid var(--m5-rule)' : 'none',
              borderTop: 'none',
              borderLeft: idx === 0 ? 'none' : '1px solid var(--m5-rule)',
              borderBottom: subsystemTab === type ? '2px solid var(--m5-ink)' : '1px solid var(--m5-rule)',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto',
        padding: '10px 16px',
        background: 'var(--m5-cream-deep)',
        borderBottom: '1px solid var(--m5-rule)',
        fontFamily: 'var(--m5-font-mono)',
        fontSize: '10px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--m5-muted)',
      }}>
        <span>#</span>
        <span>Subsystem name</span>
        <span></span>
      </div>

      <div>
        {filteredSubsystems.map((sub) => (
          <div
            key={sub.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr auto',
              padding: '14px 16px',
              borderBottom: '1px solid var(--m5-rule)',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 11, color: 'var(--m5-muted)' }}>{sub.sort_order}</span>
            <span style={{ fontSize: 14, color: 'var(--m5-ink)', fontWeight: 500 }}>{sub.name}</span>
            <button
              style={dangerBtn(hoveredBtn, `del-sub-${sub.id}`)}
              onMouseEnter={() => setHoveredBtn(`del-sub-${sub.id}`)}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => handleDeleteSubsystem(sub.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
          <Input
            value={newSubsystemName}
            onChange={(e) => setNewSubsystemName(e.target.value)}
            placeholder="New subsystem name..."
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubsystem()}
            style={{ borderRadius: 0, flex: 1 }}
          />
          <button
            style={primaryBtn(hoveredBtn, 'add-sub')}
            onMouseEnter={() => setHoveredBtn('add-sub')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleAddSubsystem}
            disabled={!newSubsystemName.trim()}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
