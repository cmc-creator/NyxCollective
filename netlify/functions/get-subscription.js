// get-subscription.js
// Returns the active Stripe subscription tier for a member.
// Requires: STRIPE_SECRET_KEY
// Optional env vars to map Price IDs to tier names:
//   STRIPE_PRICE_AMETHYST, STRIPE_PRICE_SAPPHIRE, STRIPE_PRICE_DIAMOND
// POST { email: string } → { tier, status, customerId, currentPeriodEnd, cancelAtPeriodEnd, subscription }

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

  let email;
  try {
    ({ email } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const authHeader = {
    Authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
  };

  try {
    // Find Stripe customer by email
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
      { headers: authHeader }
    );
    const searchData = await searchRes.json();
    const customer = searchData.data?.[0];

    if (!customer) {
      // No Stripe customer yet — free tier
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ tier: 'quartz', status: 'free', subscription: null }),
      };
    }

    // Fetch active subscriptions
    const subRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
      { headers: authHeader }
    );
    const subData = await subRes.json();
    const sub = subData.data?.[0];

    if (!sub) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ tier: 'quartz', status: 'free', subscription: null, customerId: customer.id }),
      };
    }

    const priceId = sub.items?.data?.[0]?.price?.id;

    // Map Stripe Price IDs to tier names.
    // Add your actual Stripe Price IDs as Netlify env vars:
    //   STRIPE_PRICE_AMETHYST = price_xxx
    //   STRIPE_PRICE_SAPPHIRE = price_xxx
    //   STRIPE_PRICE_DIAMOND  = price_xxx
    const TIER_MAP = {
      [process.env.STRIPE_PRICE_AMETHYST]: 'amethyst',
      [process.env.STRIPE_PRICE_SAPPHIRE]: 'sapphire',
      [process.env.STRIPE_PRICE_DIAMOND]: 'diamond',
    };

    const tier = (priceId && TIER_MAP[priceId]) || 'amethyst';

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        tier,
        status: sub.status,
        customerId: customer.id,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        subscription: { id: sub.id, priceId },
      }),
    };
  } catch (err) {
    console.error('get-subscription error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
