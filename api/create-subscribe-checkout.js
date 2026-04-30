// create-subscribe-checkout.js — Vercel API route
// Creates a Stripe Checkout Session in subscription mode for Diamond Mine tiers.
// POST { tier: 'amethyst'|'sapphire'|'diamond', email: string } → { url }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tier, email } = req.body || {};

  const VALID_TIERS = ['amethyst', 'sapphire', 'diamond'];
  if (!tier || !VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Server configuration error' });

  const PRICE_MAP = {
    amethyst: process.env.STRIPE_PRICE_AMETHYST,
    sapphire: process.env.STRIPE_PRICE_SAPPHIRE,
    diamond: process.env.STRIPE_PRICE_DIAMOND,
  };

  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    return res.status(503).json({ error: `${tier} tier is not yet configured. Check back soon.` });
  }

  try {
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('customer_email', email);
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', 'https://nyxcollectivellc.com/members?subscribed=true');
    params.append('cancel_url', 'https://nyxcollectivellc.com/members');
    params.append('allow_promotion_codes', 'true');

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) return res.status(stripeRes.status).json({ error: data.error?.message || 'Stripe error' });
    return res.status(200).json({ url: data.url });
  } catch (err) {
    console.error('create-subscribe-checkout error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
