import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

function formatMac(value) {
  const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 12);
  const parts = hex.match(/.{1,2}/g) || [];
  return parts.join(':');
}

export default function ManualEntry({ onSubmit }) {
  const [mac, setMac] = useState('');

  function handleChange(e) {
    setMac(formatMac(e.target.value));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mac.length === 17) {
      onSubmit(mac);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-lg mx-auto">
      <Input
        value={mac}
        onChange={handleChange}
        placeholder="AA:BB:CC:DD:EE:FF"
        className="font-mono"
        maxLength={17}
      />
      <Button type="submit" disabled={mac.length !== 17} className="cursor-pointer">
        <Search className="h-4 w-4 mr-1" /> Lookup
      </Button>
    </form>
  );
}
