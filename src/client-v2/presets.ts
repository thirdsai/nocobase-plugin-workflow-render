/**
 * Starter layouts, so a first render works without writing a template from scratch.
 * {{$...}} values are filled in by NocoBase. {{ record.x }} and {{ qr.x }} are filled in by
 * thirds.ai from the data object, which always holds the record and any QR codes.
 */
export type Starter = { key: string; label: string; format: 'pdf' | 'png'; html: string; qr?: { name: string; value: string }[]; image?: { width: number; height: number } };

const base = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;margin:0}
.page{padding:40px}h1{font-size:26px;margin:0 0 4px}.muted{color:#666;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:8px;border-bottom:1px solid #e5e5e5}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#666}
</style></head><body>`;

export const STARTERS: Starter[] = [
  {
    key: 'record',
    label: 'Record summary (PDF)',
    format: 'pdf',
    html: `${base}<div class="page">
<h1>{{ title | default('') }}</h1>
<div class="muted">Generated from NocoBase</div>
<table>
{% for f in fields | default([]) %}<tr><th>{{ f.label }}</th><td>{{ f.value }}</td></tr>
{% endfor %}</table></div></body></html>`,
  },
  {
    key: 'invoice',
    label: 'Invoice (PDF)',
    format: 'pdf',
    html: `${base}<div class="page">
<div style="display:flex;justify-content:space-between;align-items:flex-start">
<div><h1>Invoice {{ record.number | default(record.id) }}</h1>
<div class="muted">Date: {{ record.date | default(record.createdAt | default('')) }}</div>
<div class="muted">Bill to: {{ record.customer | default('') }}</div></div>
{% if qr.pay | default('') %}<img src="{{ qr.pay | safe }}" style="width:110px;height:110px">{% endif %}
</div>
<table><tr><th>Description</th><th style="text-align:right">Amount</th></tr>
<tr><td>{{ record.description | default('') }}</td><td style="text-align:right">{{ record.amount | default('') }}</td></tr>
<tr><th>Total</th><th style="text-align:right">{{ record.amount | default('') }}</th></tr></table>
</div></body></html>`,
    qr: [{ name: 'pay', value: 'https://example.com/pay/{{$context.data.id}}' }],
  },
  {
    key: 'label',
    label: 'QR label (PNG)',
    format: 'png',
    image: { width: 800, height: 400 },
    html: `${base}<div style="display:flex;align-items:center;gap:32px;padding:32px;height:400px;box-sizing:border-box">
<img src="{{ qr.code | safe }}" style="width:300px;height:300px">
<div><div class="muted">Asset</div>
<div style="font-size:44px;font-weight:700;line-height:1.1">{{ title | default('') }}</div>
<div style="font-size:28px;margin-top:12px;font-family:monospace">{{ record.code | default(record.id) }}</div></div>
</div></body></html>`,
    qr: [{ name: 'code', value: '{{$context.data.code}}' }],
  },
];
