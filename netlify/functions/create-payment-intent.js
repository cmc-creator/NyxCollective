exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return respond(500, { error: 'Server configuration error' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'Invalid JSON' }); }

  const { amount, variantId, qty, shippingId, recipient } = body;

  if (!amount || !variantId || !recipient?.name || !recipient?.address1 || !recipient?.city || !recipient?.zip) {
    return respond(400, { error: 'Missing required fields' });
  }

  const cents = Math.round(parseFloat(amount) * 100);
  if (!Number.isFinite(cents) || cents < 50) return respond(400, { error: 'Invalid amount' });

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
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sk}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) return respond(400, { error: data.error?.message || 'Stripe error' });
    return respond(200, { clientSecret: data.client_secret });
  } catch {
    return respond(500, { error: 'Internal server error' });
  }
};

function respond(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
