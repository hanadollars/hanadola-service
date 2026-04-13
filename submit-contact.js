// api/submit-contact.js — Hanadola Service Page Lead Capture
// CommonJS – fetch thuần, không npm packages

async function kvSet(key, value, ex) {
  await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, value, 'EX', ex]),
  });
}

async function sendEmail({ to, subject, html }) {
  const fromEmail = process.env.FROM_EMAIL || 'no-reply@hanadola.com';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to, subject, html }),
  });
  const text = await r.text();
  console.log('[Resend] TO:', to, '| status:', r.status, '| resp:', text);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, email, company, services, note } = req.body || {};

  // Validate bắt buộc: name, phone, email
  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ họ tên, số Zalo và email.' });
  }
  if (phone.replace(/\D/g, '').length < 9) {
    return res.status(400).json({ error: 'Số điện thoại/Zalo không hợp lệ.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Địa chỉ email không hợp lệ.' });
  }

  const leadId = `LEAD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const receivedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const leadData = {
    leadId,
    name,
    phone,
    email,
    company: company || '',
    services: services || [],
    note: note || '',
    receivedAt,
    createdAt: Date.now(),
    source: 'hanadola-service',
  };

  // Lưu vào KV — TTL 90 ngày
  await kvSet(`lead:${leadId}`, JSON.stringify(leadData), 7776000);
  console.log('[Lead] Saved:', leadId, '|', name, '|', phone, '|', email);

  const servicesList = (services && services.length > 0)
    ? services.map(s => `<li>${s}</li>`).join('')
    : '<li>Chưa chọn</li>';

  // ── Email thông báo admin ──
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (notifyEmail) {
    try {
      await sendEmail({
        to: notifyEmail,
        subject: `[Hanadola] Khách mới từ trang dịch vụ – ${name} – ${phone}`,
        html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;padding:24px;background:#0B1622;color:#E8EDF2;border-radius:12px">
<h2 style="color:#3A7BD5;margin-bottom:4px">📩 Yêu cầu tư vấn mới</h2>
<p style="font-size:12px;color:#4A6880;margin-bottom:20px">Hanadola Media & Technology · Trang Dịch Vụ</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#8FA8C0;width:35%">Họ tên</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600">${name}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#8FA8C0">Zalo</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600;color:#3A7BD5">${phone}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#8FA8C0">Email</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#5B9BD5">${email}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#8FA8C0">Công ty</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">${company || '—'}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#8FA8C0">Dịch vụ</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)"><ul style="margin:0;padding-left:16px;color:#5B9BD5">${servicesList}</ul></td></tr>
  <tr><td style="padding:10px 0;color:#8FA8C0;vertical-align:top">Ghi chú</td><td style="padding:10px 0;color:#8FA8C0;white-space:pre-wrap">${note || '—'}</td></tr>
</table>
<div style="margin-top:20px;padding:12px 16px;background:rgba(58,123,213,0.08);border:1px solid rgba(58,123,213,0.2);border-radius:8px;font-size:12px;color:#4A6880">
  Mã lead: <strong style="color:#E8EDF2">${leadId}</strong> · Nhận lúc: ${receivedAt}
</div>
</div>`,
      });
    } catch (err) { console.error('[Email] Lỗi admin:', err.message); }
  }

  // ── Email xác nhận cho khách ──
  try {
    const svcText = (services && services.length > 0) ? services.join(' · ') : 'Tư vấn chung';
    await sendEmail({
      to: email,
      subject: `Hanadola đã nhận yêu cầu tư vấn của bạn – ${name}`,
      html: `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><style>
body{font-family:'Segoe UI',Arial,sans-serif;background:#0B1622;color:#E8EDF2;margin:0;padding:0}
.wrap{max-width:500px;margin:0 auto;padding:40px 24px}
.logo{font-size:13px;font-weight:600;color:#3A7BD5;letter-spacing:.05em;margin-bottom:32px}
h1{font-size:22px;font-weight:600;margin-bottom:10px}
p{font-size:14px;color:rgba(232,237,242,0.65);line-height:1.8;margin-bottom:16px}
.box{background:rgba(255,255,255,0.03);border:1px solid rgba(58,123,213,0.2);border-radius:8px;padding:18px 20px;margin:20px 0}
.box p{color:rgba(232,237,242,0.5);margin:4px 0;font-size:13px}
.box strong{color:#E8EDF2}
.zalo-cta{background:#0068FF;color:white;display:block;text-align:center;padding:14px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;margin:24px 0}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(138,133,126,0.5);text-align:center}
</style></head><body><div class="wrap">
<div class="logo">Hanadola Media & Technology</div>
<h1>Xin chào ${name}!</h1>
<p>Chúng tôi đã nhận được yêu cầu tư vấn của bạn. Đội ngũ Hanadola sẽ chủ động <strong style="color:#E8EDF2">liên hệ Zalo</strong> cho bạn trong vòng <strong style="color:#3A7BD5">2 giờ làm việc</strong>.</p>
<div class="box">
  <p><strong>Dịch vụ quan tâm:</strong></p>
  <p style="color:#5B9BD5">${svcText}</p>
  ${note ? `<p style="margin-top:8px"><strong>Ghi chú của bạn:</strong></p><p>${note}</p>` : ''}
</div>
<p>Nếu cần hỗ trợ ngay, nhắn Zalo trực tiếp:</p>
<a href="https://zalo.me/0935251866" class="zalo-cta">💬 Nhắn Zalo ngay · 0935 251 866</a>
<p style="font-size:12px;color:rgba(232,237,242,0.35)">Giờ làm việc: Thứ 2 – Thứ 7 · 8:00 – 18:00</p>
<div class="footer">© 2026 Hanadola Media & Technology · Bảo lưu mọi quyền</div>
</div></body></html>`,
    });
  } catch (err) { console.error('[Email] Lỗi khách:', err.message); }

  return res.status(200).json({ success: true, leadId });
};
