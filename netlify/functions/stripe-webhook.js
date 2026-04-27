const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const sig = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return { statusCode: 400, body: 'Missing credentials' };

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  // Verify Stripe webhook signature
  try {
    const parts = {};
    sig.split(',').forEach(p => {
      const i = p.indexOf('=');
      parts[p.slice(0, i)] = p.slice(i + 1);
    });

    if (!parts.t || !parts.v1) return { statusCode: 400, body: 'Invalid signature header' };

    const computed = crypto
      .createHmac('sha256', secret)
      .update(parts.t + '.' + rawBody, 'utf8')
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(parts.v1))) {
      return { statusCode: 400, body: 'Signature mismatch' };
    }
  } catch {
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  let evt;
  try { evt = JSON.parse(rawBody); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  if (evt.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const m = evt.data.object.metadata || {};
  if (!m.variant_id || !m.name || !m.address1 || !m.city || !m.zip) {
    console.error('Incomplete metadata on PaymentIntent:', evt.data.object.id);
    return { statusCode: 200, body: 'Incomplete metadata — order not submitted' };
  }

  const token = process.env.PRINTFUL_TOKEN;
  if (!token) {
    console.error('PRINTFUL_TOKEN not configured');
    return { statusCode: 500, body: 'Config error' };
  }

  const orderPayload = {
    recipient: {
      name: m.name,
      address1: m.address1,
      city: m.city,
      state_code: m.state || '',
      country_code: m.country || 'US',
      zip: m.zip,
      ...(m.email ? { email: m.email } : {})
    },
    items: [{
      sync_variant_id: parseInt(m.variant_id, 10),
      quantity: parseInt(m.qty, 10) || 1
    }],
    shipping: m.shipping_id || 'STANDARD'
  };

  try {
    const res = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Printful order failed:', res.status, data);
      return { statusCode: 500, body: 'Printful order failed' };
    }

    console.log('Printful order created successfully. ID:', data.result?.id);
    return { statusCode: 200, body: 'Order submitted' };
  } catch (err) {
    console.error('Printful request error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
