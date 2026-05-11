import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function CsvPreview({ rows, errors, onImport, onCancel, importing }) {
  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Card className="border-red-500/30 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Validation Errors</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {errors.length > 10 && <li>...and {errors.length - 10} more</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{rows.length} devices ready to import</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2 text-left text-muted-foreground">MAC Address</th>
                  <th className="p-2 text-left text-muted-foreground">Type</th>
                  <th className="p-2 text-left text-muted-foreground">Serial</th>
                  <th className="p-2 text-left text-muted-foreground">Location</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="p-2 font-mono text-xs">{row.mac_address}</td>
                    <td className="p-2">{row.product_type}</td>
                    <td className="p-2 text-muted-foreground">{row.serial_number || '—'}</td>
                    <td className="p-2 text-muted-foreground">{row.location || '—'}</td>
                  </tr>
                ))}
                {rows.length > 20 && (
                  <tr><td colSpan={4} className="p-2 text-muted-foreground text-xs">...{rows.length - 20} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onImport} disabled={rows.length === 0 || importing} className="cursor-pointer">
          {importing ? 'Importing...' : `Import ${rows.length} Devices`}
        </Button>
      </div>
    </div>
  );
}
