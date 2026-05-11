import { useEffect, useState } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';
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

  if (!isAdmin) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex items-center gap-2 p-4 border-b border-border">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">Settings</h1>
          </header>
          <div className="p-4 text-center text-muted-foreground">
            Only admins can manage settings.
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">Settings</h1>
        </header>
        <div className="p-4">
          {/* Section switcher */}
          <div className="flex gap-1 mb-4 border-b border-border">
            {['stages', 'subsystems'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors cursor-pointer ${
                  activeSection === section
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {section === 'stages' ? 'Commissioning Stages' : 'Board Subsystems'}
              </button>
            ))}
          </div>

          {activeSection === 'stages' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Commissioning Stages</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Product type tabs */}
                <div className="flex gap-1 mb-4 border-b border-border">
                  {PRODUCT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveTab(type)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                        activeTab === type
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {loading ? (
                  <p className="text-muted-foreground text-sm">Loading...</p>
                ) : (
                  <div className="space-y-2">
                    {filteredStages.map((stage, idx) => (
                      <div
                        key={stage.id}
                        className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/30"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground w-6">{stage.order}</span>
                        <span className="flex-1 text-sm font-medium">{stage.name}</span>
                        <div className="flex gap-1">
                          {idx > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveStage(stage.id, stage.order - 1)}
                              className="text-xs cursor-pointer"
                            >
                              Up
                            </Button>
                          )}
                          {idx < filteredStages.length - 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveStage(stage.id, stage.order + 1)}
                              className="text-xs cursor-pointer"
                            >
                              Down
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteStage(stage.id)}
                            className="text-destructive hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Add new stage */}
                    <div className="flex gap-2 pt-2">
                      <Input
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        placeholder="New stage name..."
                        onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                      />
                      <Button onClick={handleAddStage} disabled={!newStageName.trim()} className="cursor-pointer">
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'subsystems' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Board Subsystems</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Product type tabs */}
                <div className="flex gap-1 mb-4 border-b border-border">
                  {PRODUCT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSubsystemTab(type)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                        subsystemTab === type
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {filteredSubsystems.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/30"
                    >
                      <span className="text-xs text-muted-foreground w-6">{sub.sort_order}</span>
                      <span className="flex-1 text-sm font-medium">{sub.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSubsystem(sub.id)}
                        className="text-destructive hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Add new subsystem */}
                  <div className="flex gap-2 pt-2">
                    <Input
                      value={newSubsystemName}
                      onChange={(e) => setNewSubsystemName(e.target.value)}
                      placeholder="New subsystem name..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubsystem()}
                    />
                    <Button onClick={handleAddSubsystem} disabled={!newSubsystemName.trim()} className="cursor-pointer">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
