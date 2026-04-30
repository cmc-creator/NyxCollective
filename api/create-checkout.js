// create-checkout.js — Vercel API route
// Creates a Stripe Checkout Session (payment mode) for merch.
// POST { items: [{ name, price, qty, variantId?, variantName?, thumbnail? }] } → { url }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Server configuration error' });

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  for (const item of items) {
    if (
      typeof item.name !== 'string' || !item.name.trim() ||
      typeof item.price !== 'number' || item.price <= 0 || !isFinite(item.price) ||
      !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99
    ) {
      return res.status(400).json({ error: 'Invalid item in cart' });
    }
  }

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('success_url', 'https://nyxcollectivellc.com/merch?success=true');
  params.append('cancel_url', 'https://nyxcollectivellc.com/merch');
  params.append('payment_method_types[0]', 'card');

  params.append('metadata[item_count]', String(items.length));
  items.forEach((item, i) => {
    params.append(`metadata[item_${i}]`, JSON.stringify({
      variantId: item.variantId || null,
      qty: item.qty,
      name: (item.name || '').trim().slice(0, 80),
      variantName: typeof item.variantName === 'string' ? item.variantName.slice(0, 60) : '',
      price: typeof item.price === 'number' ? item.price : 0,
    }));
  });

  const countries = ['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'JP'];
  countries.forEach((c, i) => {
    params.append(`shipping_address_collection[allowed_countries][${i}]`, c);
  });

  items.forEach((item, i) => {
    params.append(`line_items[${i}][quantity]`, String(item.qty));
    params.append(`line_items[${i}][price_data][currency]`, 'usd');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(item.price * 100)));
    params.append(`line_items[${i}][price_data][product_data][name]`, item.name.trim());
    if (typeof item.thumbnail === 'string' && /^https:\/\/.+/.test(item.thumbnail)) {
      params.append(`line_items[${i}][price_data][product_data][images][0]`, item.thumbnail);
    }
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) return res.status(stripeRes.status).json({ error: data.error?.message || 'Stripe error' });
    return res.status(200).json({ url: data.url });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
