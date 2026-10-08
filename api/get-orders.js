const { getOrdersForEmail } = require('../lib/firestore-orders');
const { emailMatches, verifyFirebaseIdToken } = require('../lib/firebase-auth');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyFirebaseIdToken(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  if (!user.emailVerified) return res.status(403).json({ error: 'Verify your email to view orders' });

  const { email } = req.body || {};
  if (!emailMatches(user, email)) return res.status(403).json({ error: 'Account email mismatch' });

  try {
    return res.status(200).json(await getOrdersForEmail(user.email));
  } catch (err) {
    console.error('Order history lookup failed:', err.message);
    return res.status(500).json({ error: 'Could not load order history' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}