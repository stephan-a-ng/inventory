import { useEffect, useState } from 'react';
import AppSidebar from '@/components/AppSidebar';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import useAuth from '@/hooks/useAuth';

const PRODUCT_TYPES = ['AEMS', 'BEMS', 'CHARGER', 'NETWORKING'];

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('AEMS');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStageName, setNewStageName] = useState('');
  const isAdmin = user?.role === 'admin';
  const [activeSection, setActiveSection] = useState('stages'); // 'stages' | 'subsystems'
  const [subsystems, setSubsystems] = useState([]);
  const [subsystemTab, setSubsystemTab] = useState('AEMS');
  const [newSubsystemName, setNewSubsystemName] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

  useEffect(() => {
    loadStages();
    loadSubsystems();
  }, []);

  async function loadStages() {
    setLoading(true);
    try {
      const res = await fetch('/api/stages', { credentials: 'include' });
      if (res.ok) setStages(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadSubsystems() {
    const res = await fetch('/api/subsystems', { credentials: 'include' });
    if (res.ok) setSubsystems(await res.json());
  }

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

  // Shared button styles
  const ghostBtn = (key) => ({
    height: 32,
    padding: '0 12px',
    border: '1px solid var(--m5-rule)',
    background: hoveredBtn === key ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
    color: 'var(--m5-ink)',
    fontWeight: 500,
    fontSize: 12,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease',
  });

  const primaryBtn = (key) => ({
    height: 38,
    padding: '0 16px',
    border: hoveredBtn === key ? '1px solid var(--m5-yellow-deep, #e6bc00)' : '1px solid var(--m5-yellow)',
    background: hoveredBtn === key ? 'var(--m5-yellow-deep, #e6bc00)' : 'var(--m5-yellow)',
    color: 'var(--m5-ink)',
    fontWeight: 600,
    fontSize: 13.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease, border-color 0.12s ease',
  });

  const dangerBtn = (key) => ({
    height: 28,
    width: 28,
    padding: 0,
    border: '1px solid transparent',
    background: 'transparent',
    color: hoveredBtn === key ? '#ef4444' : 'var(--m5-muted)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'color 0.12s ease',
  });

  const productTabBtn = (type, activeValue, setFn) => ({
    padding: '6px 14px',
    background: activeValue === type ? 'var(--m5-ink)' : 'var(--m5-cream)',
    color: activeValue === type ? 'var(--m5-cream)' : 'var(--m5-muted)',
    border: '1px solid var(--m5-rule)',
    borderRight: 'none',
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '10.5px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    borderRadius: 0,
  });

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <header style={{ padding: '24px 40px 0' }}>
            <div style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
              marginBottom: 6,
            }}>
              MoonFive / Inventory / Settings
            </div>
            <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1, margin: 0, color: 'var(--m5-ink)' }}>
              Settings.
            </h1>
          </header>
          <div style={{ padding: '28px 40px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 13 }}>
            Only admins can manage settings.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* M5 topbar */}
        <header style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div>
            <div style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
              marginBottom: 6,
            }}>
              MoonFive / Inventory / Settings
            </div>
            <h1 style={{
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              margin: 0,
              color: 'var(--m5-ink)',
            }}>
              Settings.
            </h1>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '28px 40px 64px' }}>
          {/* Section switcher */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--m5-rule)',
            marginBottom: 24,
          }}>
            {['stages', 'subsystems'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeSection === section ? '2px solid var(--m5-ink)' : '2px solid transparent',
                  color: activeSection === section ? 'var(--m5-ink)' : 'var(--m5-muted)',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontWeight: activeSection === section ? 600 : 400,
                  transition: 'color 0.12s, border-color 0.12s',
                  marginBottom: -1,
                }}
              >
                {section === 'stages' ? 'Commissioning Stages' : 'Board Subsystems'}
              </button>
            ))}
          </div>

          {activeSection === 'stages' && (
            <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', maxWidth: 680 }}>
              {/* Product type tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--m5-rule)',
              }}>
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

              {/* Table header */}
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

              {/* Stage rows */}
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
                            style={ghostBtn(`up-${stage.id}`)}
                            onMouseEnter={() => setHoveredBtn(`up-${stage.id}`)}
                            onMouseLeave={() => setHoveredBtn(null)}
                            onClick={() => handleMoveStage(stage.id, stage.order - 1)}
                          >
                            Up
                          </button>
                        )}
                        {idx < filteredStages.length - 1 && (
                          <button
                            style={ghostBtn(`down-${stage.id}`)}
                            onMouseEnter={() => setHoveredBtn(`down-${stage.id}`)}
                            onMouseLeave={() => setHoveredBtn(null)}
                            onClick={() => handleMoveStage(stage.id, stage.order + 1)}
                          >
                            Down
                          </button>
                        )}
                        <button
                          style={dangerBtn(`del-${stage.id}`)}
                          onMouseEnter={() => setHoveredBtn(`del-${stage.id}`)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          onClick={() => handleDeleteStage(stage.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add new stage row */}
                  <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
                    <Input
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      placeholder="New stage name..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                      style={{ borderRadius: 0, flex: 1 }}
                    />
                    <button
                      style={primaryBtn('add-stage')}
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
          )}

          {activeSection === 'subsystems' && (
            <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', maxWidth: 680 }}>
              {/* Product type tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--m5-rule)',
              }}>
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

              {/* Table header */}
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

              {/* Subsystem rows */}
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
                      style={dangerBtn(`del-sub-${sub.id}`)}
                      onMouseEnter={() => setHoveredBtn(`del-sub-${sub.id}`)}
                      onMouseLeave={() => setHoveredBtn(null)}
                      onClick={() => handleDeleteSubsystem(sub.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {/* Add new subsystem row */}
                <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
                  <Input
                    value={newSubsystemName}
                    onChange={(e) => setNewSubsystemName(e.target.value)}
                    placeholder="New subsystem name..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubsystem()}
                    style={{ borderRadius: 0, flex: 1 }}
                  />
                  <button
                    style={primaryBtn('add-sub')}
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
          )}
        </div>
      </main>
    </div>
  );
}
