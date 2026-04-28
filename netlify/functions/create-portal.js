// create-portal.js
// Creates a Stripe Customer Portal session for billing management.
// Requires: STRIPE_SECRET_KEY
// POST { email: string } → { url: string }
// The Stripe Customer Portal must be enabled in your Stripe dashboard:
// Stripe Dashboard → Settings → Billing → Customer portal

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
    // Look up the Stripe customer by email
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
      { headers: authHeader }
    );
    const searchData = await searchRes.json();
    const customer = searchData.data?.[0];

    if (!customer) {
      return {
        statusCode: 404,
        headers: CORS,
        body: JSON.stringify({
          error: 'No billing account found. Complete a purchase or subscription first.',
        }),
      };
    }

    // Create the portal session
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer: customer.id,
        return_url: 'https://nyxcollectivellc.com/members',
      }).toString(),
    });

    const portalData = await portalRes.json();
    if (!portalRes.ok) {
      throw new Error(portalData.error?.message || 'Portal creation failed');
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: portalData.url }) };
  } catch (err) {
    console.error('create-portal error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
