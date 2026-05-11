import { useState } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import CsvUpload from '@/components/import/CsvUpload';
import CsvPreview from '@/components/import/CsvPreview';
import ImportProgress from '@/components/import/ImportProgress';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

export default function BulkImport() {
  const [step, setStep] = useState('upload'); // upload, preview, result
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const { filters } = useDeviceStore();

  async function handleFileSelect(file) {
    setFile(file);
    // Parse client-side for preview
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setPreviewErrors(['CSV file is empty']);
      setStep('preview');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, j) => { row[h] = values[j] || ''; });

      if (!row.mac_address) {
        errors.push(`Row ${i + 1}: missing MAC address`);
      } else if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(row.mac_address)) {
        errors.push(`Row ${i + 1}: invalid MAC format`);
      } else {
        rows.push(row);
      }
    }

    setPreviewRows(rows);
    setPreviewErrors(errors);
    setStep('preview');
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/devices/bulk-import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
      setStep('result');
    } catch (err) {
      setResult({ imported: 0, errors: [err.message] });
      setStep('result');
    } finally {
      setImporting(false);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (filters.product_type) params.set('product_type', filters.product_type);
    if (filters.stage_id) params.set('stage_id', filters.stage_id);
    window.open(`/api/devices/export?${params}`, '_blank');
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setPreviewRows([]);
    setPreviewErrors([]);
    setResult(null);
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold flex-1">Bulk Import</h1>
          <Button variant="outline" onClick={handleExport} className="cursor-pointer">
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </header>
        <div className="p-4 max-w-2xl mx-auto">
          {step === 'upload' && <CsvUpload onFileSelect={handleFileSelect} />}
          {step === 'preview' && (
            <CsvPreview
              rows={previewRows}
              errors={previewErrors}
              onImport={handleImport}
              onCancel={reset}
              importing={importing}
            />
          )}
          {step === 'result' && <ImportProgress result={result} onReset={reset} />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
