const { createRemoteJWKSet, jwtVerify } = require('jose');

const firebaseKeys = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

async function verifyFirebaseIdToken(req) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!projectId || !match) return null;

  try {
    const { payload } = await jwtVerify(match[1], firebaseKeys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      uid: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return null;
  }
}

function emailMatches(user, email) {
  return Boolean(user && typeof email === 'string' && user.email === email.trim().toLowerCase());
}

module.exports = { verifyFirebaseIdToken, emailMatches };