// contact.js — Vercel API route
// Handles contact form submissions and strategy call requests.
// POST { name, email, subject, message } → { ok: true }

const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, subject, message } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('SMTP env vars not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const safeName    = String(name || '').trim().slice(0, 200);
  const safeEmail   = String(email).trim().slice(0, 200);
  const safeSubject = String(subject || 'Contact Form Submission').trim().slice(0, 300);
  const safeMessage = String(message).trim().slice(0, 5000);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: SMTP_USER,
      replyTo: safeEmail,
      subject: safeSubject,
      text: `From: ${safeName} <${safeEmail}>\n\n${safeMessage}`,
      html: `<p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p><p>${safeMessage.replace(/\n/g, '<br>')}</p>`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact email failed:', err.message);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
