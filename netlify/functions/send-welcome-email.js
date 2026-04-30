// send-welcome-email.js
// Sends a welcome email after a new member signs up.
// Called from login.html after successful Firebase account creation.
// Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// POST { email: string, displayName?: string }

const nodemailer = require('nodemailer');

const CORS = {
  'Access-Control-Allow-Origin': 'https://nyxcollectivellc.com',
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: 'Invalid JSON' }; }

  const { email, displayName } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('SMTP env vars not configured');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  const greeting = displayName ? displayName.split(' ')[0] : 'there';

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Welcome to The Diamond Mine</title>
</head>
<body style="margin:0;padding:0;background:#060608;font-family:'Inter',Helvetica,Arial,sans-serif;color:#E8DCC8;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060608;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#0d0b09;border:1px solid rgba(201,168,76,0.18);border-radius:20px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:48px 48px 32px;text-align:center;background:linear-gradient(180deg,rgba(201,168,76,0.08) 0%,transparent 100%);">
              <p style="margin:0 0 24px;font-size:28px;letter-spacing:0.05em;color:#C9A84C;">&#9670;</p>
              <h1 style="margin:0;font-size:28px;font-weight:900;letter-spacing:-0.03em;text-transform:uppercase;color:#F0C97A;">Welcome to<br>The Diamond Mine</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 48px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#E8DCC8;">Hey ${greeting},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:rgba(232,220,200,0.75);">Your account is live. You're in — and you're starting with <strong style="color:#E8DCC8;">Quartz access</strong>, which includes the Insider Newsletter and all community announcements.</p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:rgba(232,220,200,0.75);">Upgrade anytime from your member portal to unlock templates, playbooks, case studies, licensing discounts, and quarterly strategy calls.</p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#C9A84C,#F0C97A);border-radius:100px;">
                    <a href="https://nyxcollectivellc.com/members" style="display:block;padding:14px 40px;font-size:11px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:#060608;text-decoration:none;">Enter The Mine &rsaquo;</a>
                  </td>
                </tr>
              </table>

              <!-- Tier grid teaser -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid rgba(201,168,76,0.1);border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid rgba(201,168,76,0.08);">
                    <span style="font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#B0B8C0;">&#9670; Quartz</span>
                    <span style="float:right;font-size:10px;font-weight:700;color:#B0B8C0;">Free</span>
                    <div style="clear:both;margin-top:4px;font-size:12px;color:rgba(232,220,200,0.4);">Insider Newsletter</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid rgba(201,168,76,0.08);">
                    <span style="font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#C39BD3;">&#9670; Amethyst</span>
                    <span style="float:right;font-size:10px;font-weight:700;color:#C39BD3;">$9.99/mo</span>
                    <div style="clear:both;margin-top:4px;font-size:12px;color:rgba(232,220,200,0.4);">Templates &amp; SOPs, priority routing</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid rgba(201,168,76,0.08);">
                    <span style="font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#7EC8FF;">&#9670; Sapphire</span>
                    <span style="float:right;font-size:10px;font-weight:700;color:#7EC8FF;">$24.99/mo</span>
                    <div style="clear:both;margin-top:4px;font-size:12px;color:rgba(232,220,200,0.4);">Build guides, 10% discount, strategy drops</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <span style="font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#F0C97A;">&#9670; Diamond</span>
                    <span style="float:right;font-size:10px;font-weight:700;color:#F0C97A;">$49.99/mo</span>
                    <div style="clear:both;margin-top:4px;font-size:12px;color:rgba(232,220,200,0.4);">Playbooks, 20% discount, quarterly strategy call</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 48px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">
              <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#C9A84C;">NyxCollective</p>
              <p style="margin:0;font-size:11px;color:rgba(232,220,200,0.25);">You're receiving this because you created an account at nyxcollectivellc.com.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Welcome to The Diamond Mine

Hey ${greeting},

Your account is live. You're starting with Quartz access (Insider Newsletter + community announcements).

Upgrade anytime from your member portal:
- Amethyst $9.99/mo — Templates & SOPs
- Sapphire $24.99/mo — Build guides, 10% discount
- Diamond $49.99/mo — Playbooks, 20% discount, quarterly strategy call

Enter The Mine: https://nyxcollectivellc.com/members

— NyxCollective`;

  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: email,
      subject: '&#9670; Welcome to The Diamond Mine',
      text: textBody,
      html: htmlBody,
    });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Send welcome email failed:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to send email' }) };
  }
};
