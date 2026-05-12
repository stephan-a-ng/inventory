import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AppSidebar from '@/shared/components/layout/AppSidebar';

import './SerialFormat.css';

const SEGMENTS = [
  { label: 'M5', name: 'Company prefix', detail: 'Fixed identifier for Moon Five. Never changes.' },
  { label: 'BEM', name: 'Product family', detail: 'Three-letter code: BEM (Building EMS), AEM (Apartment EMS), EVS (EVSE), NET (Networking).' },
  { label: 'G2', name: 'Product generation', detail: 'Hardware generation. Increments with major hardware revisions (G2, G3, …).' },
  { label: '26W19', name: 'Manufacturing date', detail: 'Two-digit year + ISO week. 26W19 = week 19 of 2026. Sorts chronologically.' },
  { label: 'A', name: 'Factory or line code', detail: 'Single letter identifying the manufacturing facility or production line.' },
  { label: '001234', name: 'Unit sequence', detail: 'Six-digit zero-padded sequence within that week and line. One million units per batch.' },
  { label: 'C', name: 'Check digit', detail: 'Luhn mod-10 check letter (A B C D E F G H J K — I, L, O omitted). Catches typos and transpositions.' },
];

const EXAMPLES = [
  { serial: 'M5-BEM-G2-26W19-A-001234-C', decoded: 'Moon Five Building EMS, Gen 2, week 19 of 2026, line A, unit 1234' },
  { serial: 'M5-AEM-G2-26W22-A-000087-K', decoded: 'Moon Five Apartment EMS, Gen 2, week 22 of 2026, line A, unit 87' },
  { serial: 'M5-EVS-G3-27W08-B-002841-M', decoded: 'Moon Five EVSE, Gen 3, week 8 of 2027, line B, unit 2841' },
];

function PreviewBox() {
  const productTypes = ['AEMS', 'BEMS', 'EVSE', 'NETWORKING'];
  const [productType, setProductType] = useState('BEMS');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/devices/next-serial?product_type=${encodeURIComponent(productType)}`,
          { credentials: 'include' },
        );
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          setPreview(body.serial_number);
        } else if (res.status === 401) {
          setError('Sign in to preview the next serial.');
        } else {
          const body = await res.json().catch(() => ({}));
          setError(body.detail || `Failed (${res.status})`);
        }
      } catch (err) {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [productType]);

  return (
    <div className="sf-preview">
      <div className="sf-preview-head">
        <div className="sf-eyebrow">Preview · next serial</div>
        <div className="sf-preview-controls">
          {productTypes.map((pt) => (
            <button
              key={pt}
              type="button"
              className={`sf-chip${pt === productType ? ' is-active' : ''}`}
              onClick={() => setProductType(pt)}
            >
              {pt}
            </button>
          ))}
        </div>
      </div>
      <div className="sf-preview-value">
        {loading ? '…' : (preview || (error ? <span className="sf-preview-error">{error}</span> : '—'))}
      </div>
      <div className="sf-preview-note">
        The next sequence for this product, line A, generation G2, in the current ISO week.
      </div>
    </div>
  );
}

function FormatSection() {
  const [activeIdx, setActiveIdx] = useState(null);

  const handlers = (idx) => ({
    onMouseEnter: () => setActiveIdx(idx),
    onMouseLeave: () => setActiveIdx((cur) => (cur === idx ? null : cur)),
    onFocus: () => setActiveIdx(idx),
    onBlur: () => setActiveIdx((cur) => (cur === idx ? null : cur)),
  });

  return (
    <section className="sf-section">
      <div className="sf-section-head">Format</div>
      <pre className="sf-code">
        {SEGMENTS.map((s, idx) => (
          <span key={s.label}>
            {idx > 0 && <span className="sf-code-sep">-</span>}
            <button
              type="button"
              className={`sf-code-seg${activeIdx === idx ? ' is-active' : ''}`}
              aria-label={`${s.label} — ${s.name}`}
              {...handlers(idx)}
            >
              {s.label}
            </button>
          </span>
        ))}
      </pre>
      <div className="sf-segments">
        {SEGMENTS.map((s, idx) => (
          <div
            className={`sf-segment${activeIdx === idx ? ' is-active' : ''}`}
            key={s.label}
            {...handlers(idx)}
          >
            <div className="sf-segment-label">{s.label}</div>
            <div className="sf-segment-body">
              <div className="sf-segment-name">{s.name}</div>
              <div className="sf-segment-detail">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SerialFormat() {
  return (
    <div className="sf-shell">
      <AppSidebar />
      <main className="sf-main">
        <div className="sf-page">
          <Link to="/" className="sf-back">← Back to inventory</Link>

          <header className="sf-header">
            <div className="sf-meta">
              <span className="sf-yb" />
              MoonFive
              <span className="sf-sep">·</span>
              Reference
            </div>
            <h1 className="sf-title">Serial-number format.</h1>
            <p className="sf-lede">
              Every Moon Five device carries one immutable structured serial.
              It's printed on the unit, scannable by QR or barcode, and stays
              with the hardware for life. Software keeps a separate opaque UUID
              for database joins.
            </p>
          </header>

          <FormatSection />

          <section className="sf-section">
            <div className="sf-section-head">Examples</div>
            <div className="sf-examples">
              {EXAMPLES.map((ex) => (
                <div className="sf-example" key={ex.serial}>
                  <div className="sf-example-serial">{ex.serial}</div>
                  <div className="sf-example-decoded">{ex.decoded}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="sf-section">
            <PreviewBox />
          </section>

          <section className="sf-section">
            <div className="sf-section-head">Why this shape</div>
            <ul className="sf-list">
              <li>
                <strong>Front-loaded static segments</strong> — company and product
                family sort and filter cleanly in spreadsheets and inventory tools.
              </li>
              <li>
                <strong>ISO week, not calendar month</strong> — manufacturing happens
                in weekly batches, and YYWW sorts lexicographically, so alphabetical
                sort is chronological.
              </li>
              <li>
                <strong>No ambiguous characters</strong> in the check segment.
                The alphabet skips I, L, O, 0 and 1 to prevent read errors from a
                tech typing serials off a label or reading them over the phone.
              </li>
              <li>
                <strong>Single-letter check digit</strong> validates the rest of the
                serial via Luhn mod-10. Catches ~98% of single-digit and transposition
                errors — pays for itself the first time a tech mistypes an RMA.
              </li>
              <li>
                <strong>Structured serial separate from UUID</strong>. The serial
                is the immutable physical identity. The UUID (v4) is for software.
                Database joins go through the UUID; humans use the serial.
              </li>
              <li>
                <strong>No mutable data in the serial</strong> — never customer,
                site, firmware, owner, or subscription status. All of those change
                over the device's life; they belong in rows keyed to the serial,
                not in the serial itself.
              </li>
            </ul>
          </section>

          <section className="sf-section">
            <div className="sf-section-head">Sub-assembly variant (optional)</div>
            <p className="sf-body">
              For PCBs, enclosures, or connector modules, extend the family code
              with a dot suffix while keeping the parent format intact:
            </p>
            <pre className="sf-code">M5-BEM.PCB-G2-26W19-A-001234-C
M5-BEM.ENC-G2-26W19-A-001234-C</pre>
          </section>

          <div className="sf-footnote">
            Full reference: <code>docs/claude/SERIAL-NUMBERS.md</code> in the repo.
          </div>
        </div>
      </main>
    </div>
  );
}
