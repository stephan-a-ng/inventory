import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import {
  ghostBtn,
  primaryBtn,
  dangerBtn,
  productTabBtn,
  PRODUCT_TYPES,
} from '@/shared/lib/m5-styles';

export default function StagesPanel() {
  const [activeTab, setActiveTab] = useState('AEMS');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStageName, setNewStageName] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

  async function loadStages() {
    setLoading(true);
    try {
      const res = await fetch('/api/stages', { credentials: 'include' });
      if (res.ok) setStages(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStages();
  }, []);

  const filteredStages = stages
    .filter((s) => s.product_type === activeTab)
    .sort((a, b) => a.order - b.order);

  async function handleAddStage() {
    if (!newStageName.trim()) return;
    const res = await fetch('/api/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ product_type: activeTab, name: newStageName.trim() }),
    });
    if (res.ok) {
      setNewStageName('');
      loadStages();
    }
  }

  async function handleDeleteStage(stageId) {
    if (!confirm('Delete this stage? This cannot be undone.')) return;
    const res = await fetch(`/api/stages/${stageId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      loadStages();
    } else {
      const data = await res.json();
      alert(data.detail || 'Failed to delete stage');
    }
  }

  async function handleMoveStage(stageId, newOrder) {
    await fetch(`/api/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ order: newOrder }),
    });
    loadStages();
  }

  return (
    <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', maxWidth: 680 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--m5-rule)' }}>
        {PRODUCT_TYPES.map((type, idx) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            style={{
              ...productTabBtn(type, activeTab),
              borderRight: idx === PRODUCT_TYPES.length - 1 ? '1px solid var(--m5-rule)' : 'none',
              borderTop: 'none',
              borderLeft: idx === 0 ? 'none' : '1px solid var(--m5-rule)',
              borderBottom: activeTab === type ? '2px solid var(--m5-ink)' : '1px solid var(--m5-rule)',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 32px 1fr auto',
        padding: '10px 16px',
        background: 'var(--m5-cream-deep)',
        borderBottom: '1px solid var(--m5-rule)',
        fontFamily: 'var(--m5-font-mono)',
        fontSize: '10px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--m5-muted)',
      }}>
        <span></span>
        <span>#</span>
        <span>Stage name</span>
        <span>Actions</span>
      </div>

      {loading ? (
        <div style={{ padding: '20px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
          Loading...
        </div>
      ) : (
        <div>
          {filteredStages.map((stage, idx) => (
            <div
              key={stage.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 32px 1fr auto',
                padding: '14px 16px',
                borderBottom: '1px solid var(--m5-rule)',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <GripVertical size={14} style={{ color: 'var(--m5-muted)', cursor: 'grab' }} />
              <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 11, color: 'var(--m5-muted)' }}>{stage.order}</span>
              <span style={{ fontSize: 14, color: 'var(--m5-ink)', fontWeight: 500 }}>{stage.name}</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {idx > 0 && (
                  <button
                    style={ghostBtn(hoveredBtn, `up-${stage.id}`)}
                    onMouseEnter={() => setHoveredBtn(`up-${stage.id}`)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    onClick={() => handleMoveStage(stage.id, stage.order - 1)}
                  >
                    Up
                  </button>
                )}
                {idx < filteredStages.length - 1 && (
                  <button
                    style={ghostBtn(hoveredBtn, `down-${stage.id}`)}
                    onMouseEnter={() => setHoveredBtn(`down-${stage.id}`)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    onClick={() => handleMoveStage(stage.id, stage.order + 1)}
                  >
                    Down
                  </button>
                )}
                <button
                  style={dangerBtn(hoveredBtn, `del-${stage.id}`)}
                  onMouseEnter={() => setHoveredBtn(`del-${stage.id}`)}
                  onMouseLeave={() => setHoveredBtn(null)}
                  onClick={() => handleDeleteStage(stage.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
            <Input
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="New stage name..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
              style={{ borderRadius: 0, flex: 1 }}
            />
            <button
              style={primaryBtn(hoveredBtn, 'add-stage')}
              onMouseEnter={() => setHoveredBtn('add-stage')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={handleAddStage}
              disabled={!newStageName.trim()}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
