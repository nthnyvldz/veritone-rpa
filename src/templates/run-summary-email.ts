import { AdvertRunResult } from '../shared/email-service';

export function buildRunSummaryHtml(results: AdvertRunResult[], runDate: string): string {
  const successCount = results.filter((r) => r.status === 'success').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  const rows = results.map((r, i) => {
    const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
    const statusColor =
      r.status === 'success' ? '#27ae60' :
      r.status === 'skipped' ? '#f39c12' :
      '#e74c3c';
    const statusLabel =
      r.status === 'success' ? 'Success' :
      r.status === 'skipped' ? 'Skipped' :
      'Error';

    const cell = (val: string | number | undefined | null) =>
      `<td style="padding:8px 10px;border-bottom:1px solid #e8e8e8;font-size:12px;vertical-align:top;">${val ?? '—'}</td>`;

    return `<tr style="background:${bg};">
      ${cell(r.refNumber)}
      ${cell(r.advertTitle)}
      ${cell(r.location)}
      <td style="padding:8px 10px;border-bottom:1px solid #e8e8e8;font-size:12px;vertical-align:top;font-weight:bold;color:${statusColor};">${statusLabel}</td>
      ${cell(r.selectedKeywords?.join(', '))}
      ${cell(r.totalApplications)}
      ${cell(r.filteredCount)}
      ${cell(r.unflaggedForReview)}
      ${cell(r.passCount)}
    </tr>`;
  }).join('');

  const th = (label: string) =>
    `<th style="padding:9px 10px;background:#2c3e50;color:#fff;font-size:11px;font-weight:bold;text-align:left;white-space:nowrap;">${label}</th>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f5f5;font-family:Arial,sans-serif;font-size:13px;color:#333;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="background:#2c3e50;color:#fff;padding:20px 24px;border-radius:4px 4px 0 0;">
      <h1 style="margin:0;font-size:18px;font-weight:normal;">Veritone RPA — Run Summary</h1>
      <p style="margin:6px 0 0;font-size:12px;opacity:0.8;">${runDate}</p>
    </div>
    <div style="background:#fff;padding:14px 24px;border-bottom:1px solid #e0e0e0;">
      <span style="margin-right:20px;">&#10003; <strong>${successCount}</strong> processed</span>
      <span style="margin-right:20px;">&#9888; <strong>${skippedCount}</strong> skipped</span>
      <span>&#10007; <strong>${errorCount}</strong> errors</span>
    </div>
    <div style="background:#fff;padding:16px 24px;border-radius:0 0 4px 4px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            ${th('Job Number')}
            ${th('Job Title')}
            ${th('Job Location')}
            ${th('Status')}
            ${th('Keywords Used')}
            ${th('Total Applicants')}
            ${th('After KW Filter')}
            ${th('AI Review Count')}
            ${th('AI Passed')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}
