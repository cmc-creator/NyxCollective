// stripe-webhook.js — Vercel API route
// Handles Stripe payment_intent.succeeded → submits order to Printful.
// Raw body required for signature verification — bodyParser is disabled below.

const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return res.status(400).end('Missing credentials');

  // Collect raw body (bodyParser is disabled for this route)
  const rawBody = await getRawBody(req);

  // Verify Stripe webhook signature
  try {
    const parts = {};
    sig.split(',').forEach(p => {
      const i = p.indexOf('=');
      parts[p.slice(0, i)] = p.slice(i + 1);
    });

    if (!parts.t || !parts.v1) return res.status(400).end('Invalid signature header');

    const computed = crypto
      .createHmac('sha256', secret)
      .update(parts.t + '.' + rawBody, 'utf8')
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(parts.v1))) {
      return res.status(400).end('Signature mismatch');
    }
  } catch {
    return res.status(400).end('Signature verification failed');
  }

  let evt;
  try { evt = JSON.parse(rawBody); } catch { return res.status(400).end('Invalid JSON'); }

  if (evt.type !== 'payment_intent.succeeded') {
    return res.status(200).end('Ignored');
  }

  const m = evt.data.object.metadata || {};
  if (!m.variant_id || !m.name || !m.address1 || !m.city || !m.zip) {
    console.error('Incomplete metadata on PaymentIntent:', evt.data.object.id);
    return res.status(200).end('Incomplete metadata — order not submitted');
  }

  const token = process.env.PRINTFUL_TOKEN;
  if (!token) {
    console.error('PRINTFUL_TOKEN not configured');
    return res.status(500).end('Config error');
  }

  const orderPayload = {
    recipient: {
      name: m.name,
      address1: m.address1,
      city: m.city,
      state_code: m.state || '',
      country_code: m.country || 'US',
      zip: m.zip,
      ...(m.email ? { email: m.email } : {}),
    },
    items: [{
      sync_variant_id: parseInt(m.variant_id, 10),
      quantity: parseInt(m.qty, 10) || 1,
    }],
    shipping: m.shipping_id || 'STANDARD',
  };

  try {
    const pfRes = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    const data = await pfRes.json().catch(() => ({}));
    if (!pfRes.ok) {
      console.error('Printful order failed:', pfRes.status, data);
      return res.status(500).end('Printful order failed');
    }

    console.log('Printful order created successfully. ID:', data.result?.id);
    return res.status(200).end('Order submitted');
  } catch (err) {
    console.error('Printful request error:', err);
    return res.status(500).end('Internal error');
  }
};

// Disable Vercel's automatic body parser so we get the raw buffer
module.exports.config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
