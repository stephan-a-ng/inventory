import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { ExternalLink, AlertCircle, Cpu } from 'lucide-react';

export default function ScanResult({ device, notFound, mac }) {
  const navigate = useNavigate();

  if (notFound) {
    return (
      <Card className="max-w-lg mx-auto border-red-500/30">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="font-medium">Device Not Found</p>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{mac}</p>
        </CardContent>
      </Card>
    );
  }

  if (!device) return null;

  return (
    <Card className="max-w-lg mx-auto border-primary/30">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm font-medium">{device.mac_address}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {device.product_type} — {device.current_stage_name || 'Unassigned'}
            </p>
            {device.serial_number && (
              <p className="text-xs text-muted-foreground mt-1">S/N: {device.serial_number}</p>
            )}
            {device.site_name && (
              <p className="text-xs text-muted-foreground">Site: {device.site_name}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/devices/${device.id}`)} className="cursor-pointer">
            <ExternalLink className="h-3 w-3 mr-1" /> View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
