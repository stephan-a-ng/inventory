import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportProgress({ result, onReset }) {
  if (!result) return null;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          {result.imported > 0 ? (
            <CheckCircle className="h-8 w-8 text-green-500" />
          ) : (
            <AlertCircle className="h-8 w-8 text-red-500" />
          )}
          <div>
            <p className="text-lg font-semibold">
              {result.imported} device{result.imported !== 1 ? 's' : ''} imported
            </p>
            {result.errors?.length > 0 && (
              <p className="text-sm text-muted-foreground">{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        {result.errors?.length > 0 && (
          <div className="bg-secondary rounded-lg p-3">
            <ul className="text-xs space-y-1 text-muted-foreground">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        <Button onClick={onReset} className="cursor-pointer">Import More</Button>
      </CardContent>
    </Card>
  );
}
