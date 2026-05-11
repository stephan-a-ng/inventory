import { useState } from 'react';
import AppSidebar from '@/components/AppSidebar';
import CsvUpload from '@/components/import/CsvUpload';
import CsvPreview from '@/components/import/CsvPreview';
import ImportProgress from '@/components/import/ImportProgress';
import { Download } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

export default function BulkImport() {
  const [step, setStep] = useState('upload'); // upload, preview, result
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [hoveredBtn, setHoveredBtn] = useState(null);
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

  const ghostBtn = (key) => ({
    height: 38,
    padding: '0 16px',
    border: '1px solid var(--m5-rule)',
    background: hoveredBtn === key ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
    color: 'var(--m5-ink)',
    fontWeight: 600,
    fontSize: 13.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease',
  });

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
              MoonFive / Inventory / Import
            </div>
            <h1 style={{
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              margin: 0,
              color: 'var(--m5-ink)',
            }}>
              Import.
            </h1>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', paddingBottom: 4 }}>
            <button
              style={ghostBtn('export')}
              onMouseEnter={() => setHoveredBtn('export')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={handleExport}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '28px 40px 64px' }}>
          <div style={{ maxWidth: 720 }}>
            {step === 'upload' && (
              <div style={{
                border: '2px dashed var(--m5-rule)',
                background: `repeating-linear-gradient(135deg, var(--m5-cream-deep) 0 14px, transparent 14px 28px), var(--m5-cream)`,
              }}>
                <CsvUpload onFileSelect={handleFileSelect} />
              </div>
            )}
            {step === 'preview' && (
              <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
                <div style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--m5-rule)',
                  background: 'var(--m5-cream-deep)',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--m5-muted)',
                }}>
                  Preview — {previewRows.length} rows
                </div>
                <div style={{ padding: '20px' }}>
                  <CsvPreview
                    rows={previewRows}
                    errors={previewErrors}
                    onImport={handleImport}
                    onCancel={reset}
                    importing={importing}
                  />
                </div>
              </div>
            )}
            {step === 'result' && (
              <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
                <div style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--m5-rule)',
                  background: 'var(--m5-cream-deep)',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--m5-muted)',
                }}>
                  Import result
                </div>
                <div style={{ padding: '20px' }}>
                  <ImportProgress result={result} onReset={reset} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
