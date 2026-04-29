// create-subscribe-checkout.js
// Creates a Stripe Checkout Session in subscription mode for Diamond Mine tiers.
// Requires: STRIPE_SECRET_KEY
// Required tier env vars (add in Netlify): STRIPE_PRICE_AMETHYST, STRIPE_PRICE_SAPPHIRE, STRIPE_PRICE_DIAMOND
//
// HOW TO SET UP SUBSCRIPTION TIERS:
// 1. Go to Stripe Dashboard → Products → + Add product
// 2. Create a product for each tier (e.g. "Diamond Mine - Amethyst")
// 3. Set a recurring price (e.g. $9.99/month)
// 4. Copy the Price ID (starts with price_) and add it to Netlify env vars
//
// POST { tier: 'amethyst'|'sapphire'|'diamond', email: string } → { url: string }

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': 'https://nyxcollectivellc.com',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tier, email;
  try {
    ({ tier, email } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const VALID_TIERS = ['amethyst', 'sapphire', 'diamond'];
  if (!tier || !VALID_TIERS.includes(tier)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid tier' }) };
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const PRICE_MAP = {
    amethyst: process.env.STRIPE_PRICE_AMETHYST,
    sapphire: process.env.STRIPE_PRICE_SAPPHIRE,
    diamond: process.env.STRIPE_PRICE_DIAMOND,
  };

  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: `${tier} tier is not yet configured. Check back soon.` }),
    };
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

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Stripe error');
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: data.url }) };
  } catch (err) {
    console.error('create-subscribe-checkout error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
