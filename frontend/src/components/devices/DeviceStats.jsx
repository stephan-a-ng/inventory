import { Card, CardContent } from '@/components/ui/card';
import { Cpu, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export default function DeviceStats({ devices, total }) {
  const deployed = devices.filter((d) => d.current_stage_name === 'Deployed').length;
  const inProgress = devices.filter((d) => d.current_stage_name && d.current_stage_name !== 'Deployed').length;
  const noStage = devices.filter((d) => !d.current_stage_name).length;

  const stats = [
    { label: 'Total Devices', value: total, icon: Cpu, color: 'text-primary' },
    { label: 'Deployed', value: deployed, icon: CheckCircle, color: 'text-green-500' },
    { label: 'In Progress', value: inProgress, icon: Clock, color: 'text-yellow-500' },
    { label: 'No Stage', value: noStage, icon: AlertTriangle, color: 'text-red-500' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
