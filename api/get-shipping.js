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

  try {
    const pfRes = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          address1: address.address1 || '',
          city: address.city,
          state_code: address.state_code || '',
          country_code: address.country_code || 'US',
          zip: address.zip,
        },
        items: [{ sync_variant_id: parseInt(variantId, 10), quantity: parseInt(quantity, 10) || 1 }],
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
