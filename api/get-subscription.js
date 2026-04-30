// get-subscription.js — Vercel API route
// Returns the active Stripe subscription tier for a member.
// POST { email: string } → { tier, status, customerId, currentPeriodEnd, cancelAtPeriodEnd, subscription }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Server configuration error' });

  const authHeader = {
    Authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
  };

  try {
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
      { headers: authHeader }
    );
    const searchData = await searchRes.json();
    const customer = searchData.data?.[0];

    if (!customer) {
      return res.status(200).json({ tier: 'quartz', status: 'free', subscription: null });
    }

    const subRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
      { headers: authHeader }
    );
    const subData = await subRes.json();
    const sub = subData.data?.[0];

    if (!sub) {
      return res.status(200).json({ tier: 'quartz', status: 'free', subscription: null, customerId: customer.id });
    }

    const priceId = sub.items?.data?.[0]?.price?.id;
    const TIER_MAP = {
      [process.env.STRIPE_PRICE_AMETHYST]: 'amethyst',
      [process.env.STRIPE_PRICE_SAPPHIRE]: 'sapphire',
      [process.env.STRIPE_PRICE_DIAMOND]: 'diamond',
    };

    const tier = (priceId && TIER_MAP[priceId]) || 'amethyst';

    return res.status(200).json({
      tier,
      status: sub.status,
      customerId: customer.id,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      subscription: { id: sub.id, priceId },
    });
  } catch (err) {
    console.error('get-subscription error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
