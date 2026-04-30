// products.js — Vercel API route
// Returns product catalog from Printful.
// GET → [products]

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const listRes = await fetch('https://api.printful.com/store/products', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Failed to reach Printful', details: err });
    }

    const list = await listRes.json();

    if (!list.result || !list.result.length) {
      return res.status(200).json([]);
    }

    const products = await Promise.all(
      list.result.map(async (p) => {
        try {
          const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const detail = await detailRes.json();
          const variants = detail.result?.sync_variants || [];
          const prices = variants
            .map(v => parseFloat(v.retail_price))
            .filter(x => !isNaN(x) && x > 0);

          return {
            id: p.id,
            name: p.name,
            thumbnail: p.thumbnail_url || null,
            variants: p.variants,
            minPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
            maxPrice: prices.length ? Math.max(...prices).toFixed(2) : null,
            variantDetails: variants.map(v => ({ id: v.id, name: v.name, price: v.retail_price })),
          };
        } catch {
          return {
            id: p.id,
            name: p.name,
            thumbnail: p.thumbnail_url || null,
            variants: p.variants,
            minPrice: null,
            maxPrice: null,
            variantDetails: [],
          };
        }
      })
    );

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(products);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
