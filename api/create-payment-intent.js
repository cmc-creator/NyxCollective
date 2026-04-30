// create-payment-intent.js — Vercel API route
// Creates a Stripe PaymentIntent for merch checkout.
// POST { amount, variantId, qty, shippingId, recipient } → { clientSecret }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return res.status(500).json({ error: 'Server configuration error' });

  const { amount, variantId, qty, shippingId, recipient } = req.body || {};

  if (!amount || !variantId || !recipient?.name || !recipient?.address1 || !recipient?.city || !recipient?.zip) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cents = Math.round(parseFloat(amount) * 100);
  if (!Number.isFinite(cents) || cents < 50) return res.status(400).json({ error: 'Invalid amount' });

  const params = new URLSearchParams();
  params.set('amount', String(cents));
  params.set('currency', 'usd');
  params.set('metadata[variant_id]', String(variantId));
  params.set('metadata[qty]', String(parseInt(qty, 10) || 1));
  params.set('metadata[shipping_id]', String(shippingId || ''));
  params.set('metadata[name]', String(recipient.name).trim().slice(0, 200));
  params.set('metadata[email]', String(recipient.email || '').trim().slice(0, 200));
  params.set('metadata[address1]', String(recipient.address1).trim().slice(0, 200));
  params.set('metadata[city]', String(recipient.city).trim().slice(0, 100));
  params.set('metadata[state]', String(recipient.state_code || '').trim().slice(0, 50));
  params.set('metadata[zip]', String(recipient.zip).trim().slice(0, 20));
  params.set('metadata[country]', String(recipient.country_code || 'US').trim().slice(0, 2));

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sk}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) return res.status(400).json({ error: data.error?.message || 'Stripe error' });
    return res.status(200).json({ clientSecret: data.client_secret });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
