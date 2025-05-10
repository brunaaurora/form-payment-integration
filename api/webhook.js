// api/webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');

// This is a raw body handler for Stripe webhooks
export const config = {
  api: {
    bodyParser: false, // Don't parse the body for Stripe webhook
  },
};

// Handle Stripe webhook raw body parsing
const getRawBody = async (req) => {
  const chunks = [];
  
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  
  return Buffer.concat(chunks);
};

// Store data in Google Sheets
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

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  // Get the raw body for Stripe webhook verification
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(
      rawBody, 
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
      // Store data in Google Sheets
      await storeDataInGoogleSheets(formData);
      console.log('Payment data successfully processed');
    } catch (error) {
      console.error('Error processing payment data:', error);
      // We still return 200 to Stripe so they don't retry the webhook
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({ received: true });
};

export default handler;
