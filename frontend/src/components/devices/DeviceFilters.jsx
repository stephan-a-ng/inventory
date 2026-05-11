import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

const PRODUCT_TYPES = ['', 'AEMS', 'BEMS', 'CHARGER', 'NETWORKING'];

export default function DeviceFilters() {
  const { filters, setFilter, stages } = useDeviceStore();

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search MAC, serial, site..."
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          className="pl-9"
        />
      </div>
      <select
        value={filters.product_type}
        onChange={(e) => setFilter('product_type', e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All Types</option>
        {PRODUCT_TYPES.filter(Boolean).map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <select
        value={filters.stage_id}
        onChange={(e) => setFilter('stage_id', e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All Stages</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.product_type})</option>
        ))}
      </select>
    </div>
  );
}
