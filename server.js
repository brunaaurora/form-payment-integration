// server.js - Main backend file for Stripe Checkout integration
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');

const app = express();

// Fix CORS issue - allow requests from any domain
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'OPTIONS'], // Allow these HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow these headers
  credentials: true // Allow cookies to be sent
}));

// Middleware for JSON and raw body processing
app.use(express.json());

// Add a route for the root path to verify the server is running
app.get('/', (req, res) => {
  res.send('Form payment integration API is running. Use /create-checkout-session to create a payment.');
});

// Create a checkout session endpoint
app.post('/create-checkout-session', async (req, res) => {
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
    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle raw body for Stripe webhooks
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      endpointSecret
    );
    console.log('Webhook received:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Extract metadata from the session
    const { customerName, ...formMetadata } = session.metadata;
    
    // Get customer email from the session
    const customerEmail = session.customer_details.email;
    
    // Create data object to store/send
    const formData = {
      name: customerName,
      email: customerEmail,
      paymentStatus: 'completed',
      paymentId: session.payment_intent,
      paymentAmount: session.amount_total / 100, // Convert from cents
      timestamp: new Date().toISOString(),
      ...formMetadata,
    };
    
    console.log('Processing completed payment for:', customerEmail);
    
    try {
      // 1. Store data in Google Sheets
      await storeDataInGoogleSheets(formData);
      
      // 2. Optionally send data via email
      // await sendDataViaEmail(formData);
      
      console.log('Payment data successfully processed');
    } catch (error) {
      console.error('Error processing payment data:', error);
      // We still return 200 to Stripe so they don't retry the webhook
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({ received: true });
});

// Function to store data in Google Sheets
async function storeDataInGoogleSheets(formData) {
  try {
    // Get the service account credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');
    
    if (!credentials.client_email || !credentials.private_key) {
      console.error('Missing or invalid Google credentials');
      return;
    }
    
    // Set up Google Sheets API
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      console.error('Missing spreadsheet ID');
      return;
    }
    
    // Format data for Google Sheets
    const values = [
      [
        formData.timestamp,
        formData.name,
        formData.email,
        formData.paymentStatus,
        formData.paymentId,
        formData.paymentAmount,
        // Add any other form fields
        formData.preferences || '',
        formData.notes || '',
        formData.age || '',
        formData.primaryConcern || '',
        formData.additionalConcerns || '',
        formData.goals || '',
        formData.photoCount || ''
      ]
    ];
    
    // Append data to the Google Sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:M', // Adjust range as needed
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    
    console.log('Data stored in Google Sheets successfully', response.data);
    return response.data;
  } catch (error) {
    console.error('Error storing data in Google Sheets:', error);
    throw error;
  }
}

// Function to send data via email (commented out but available)
async function sendDataViaEmail(formData) {
  // Implement email sending logic here if needed
  console.log('Would send email with data:', formData);
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for serverless functions (e.g., Vercel, Netlify)
module.exports = app;
