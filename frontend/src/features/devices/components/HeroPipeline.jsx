/**
 * Hero pipeline — big total + 6 stage cells.
 *
 * Reads { total, by_stage_name } from the device store. The terminal cell
 * (last entry in by_stage_name, conventionally "Deployed") gets ink-dark
 * styling per the design.
 */
export default function HeroPipeline({ stats }) {
  const total = stats?.total ?? 0;
  const cells = stats?.by_stage_name ?? [];
  const lastIdx = cells.length - 1;
  const deployedCount = lastIdx >= 0 ? cells[lastIdx].count : 0;
  const inProgress = total - deployedCount;

  return (
    <section className="hero">
      <div className="lbl">
        <span className="yb" />
        Inventory · summary
      </div>
      <h1>{total.toLocaleString()}</h1>
      <p className="h-sub">
        {total === 0 ? (
          <>no devices registered yet — scan or enter a MAC below to add the first one.</>
        ) : (
          <>
            devices tracked — <strong>{deployedCount.toLocaleString()}</strong> deployed in the field,
            <strong> {inProgress.toLocaleString()}</strong> still moving through commissioning.
          </>
        )}
      </p>

      <div className="stages">
        {cells.map((cell, idx) => {
          const terminal = idx === lastIdx;
          const num = String(idx + 1).padStart(2, '0');
          return (
            <div
              key={cell.name}
              className={'stage-cell' + (terminal ? ' terminal' : '')}
            >
              <div className="num">STAGE {num}</div>
              <div className="count">{cell.count.toLocaleString()}</div>
              <div className="name">{cell.name}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
