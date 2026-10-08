// get-shipping.js — Vercel API route
// Gets shipping rates from Printful.
// POST { variantId, quantity, address: { address1, city, state_code, country_code, zip } } → [rates]

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server configuration error' });

  const { variantId, quantity, address } = req.body || {};
  if (!variantId || !address?.city || !address?.zip) {
    return res.status(400).json({ error: 'Missing required fields: variantId, address.city, address.zip' });
  }
  const countryCode = String(address.country_code || 'US').toUpperCase();
  const stateCode = String(address.state_code || '').trim().toUpperCase();
  if (!Number.isInteger(Number(variantId)) || Number(variantId) < 1 ||
      !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 10 ||
      !['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'JP'].includes(countryCode) ||
      (['US', 'CA', 'AU'].includes(countryCode) && !stateCode)) {
    return res.status(400).json({ error: 'Invalid product or shipping address' });
  }

  try {
    const pfRes = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          address1: address.address1 || '',
          city: address.city,
          state_code: address.state_code || '',
          country_code: countryCode,
          state_code: stateCode,
          zip: address.zip,
        },
        items: [{ sync_variant_id: Number(variantId), quantity: Number(quantity) }],
        currency: 'USD',
      }),
    });

    const data = await pfRes.json();
    if (!pfRes.ok) return res.status(502).json({ error: 'Shipping rates unavailable', details: data });
    return res.status(200).json(data.result || []);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
