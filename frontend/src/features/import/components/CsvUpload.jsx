import { useCallback } from 'react';
import { Upload } from 'lucide-react';

export default function CsvUpload({ onFileSelect }) {
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file?.name.endsWith('.csv')) onFileSelect(file);
  }, [onFileSelect]);

  const handleChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => document.getElementById('csv-input').click()}
    >
      <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
      <p className="text-lg font-medium">Drop CSV file here</p>
      <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
      <p className="text-xs text-muted-foreground mt-3">
        Required columns: mac_address, product_type
      </p>
      <input
        id="csv-input"
        type="file"
        accept=".csv"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
