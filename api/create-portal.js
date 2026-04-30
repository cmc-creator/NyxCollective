// create-portal.js — Vercel API route
// Creates a Stripe Customer Portal session for billing management.
// POST { email: string } → { url }

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
      return res.status(404).json({
        error: 'No billing account found. Complete a purchase or subscription first.',
      });
    }

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer: customer.id,
        return_url: 'https://nyxcollectivellc.com/members',
      }).toString(),
    });

    const portalData = await portalRes.json();
    if (!portalRes.ok) throw new Error(portalData.error?.message || 'Portal creation failed');

    return res.status(200).json({ url: portalData.url });
  } catch (err) {
    console.error('create-portal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
