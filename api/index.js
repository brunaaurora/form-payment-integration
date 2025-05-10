// api/index.js
// This is the root API route

export default function handler(req, res) {
  res.status(200).json({ 
    status: 'API is running', 
    availableEndpoints: [
      '/api/create-checkout-session', 
      '/api/webhook'
    ],
    message: 'Use /api/create-checkout-session to create a Stripe checkout session'
  });
}
