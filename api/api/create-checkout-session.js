// api/create-checkout-session.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Handle CORS
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  return await fn(req, res);
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('Received checkout request:', req.body);
    
    const { 
      productName, 
      productPrice, 
      customerName, 
      customerEmail, 
      metadata 
    } = req.body;

    // Validate required fields
    if (!productName || !productPrice || !customerEmail) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide productName, productPrice, and customerEmail.' 
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
            },
            unit_amount: productPrice, // Price in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://your-framer-site.com/success',
      cancel_url: 'https://your-framer-site.com/cancel',
      customer_email: customerEmail,
      metadata: {
        customerName: customerName,
        ...metadata, // Include all additional form data as metadata
      },
    });

    // Return the checkout URL to the frontend
    console.log('Checkout session created:', session.id);
    res.status(200).json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = allowCors(handler);
