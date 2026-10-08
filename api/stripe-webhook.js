// Keep the legacy endpoint on the shared webhook handler so both events use
// the same Stripe signing secret and idempotent fulfillment logic.
module.exports = require('./printful-webhook');
module.exports.config = { api: { bodyParser: false } };
