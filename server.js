// This implementation consists of three parts:
// 1. Frontend code to embed in your Framer site
// 2. Backend API code to create Stripe Checkout sessions
// 3. Webhook handler to process successful payments

// PART 1: FRONTEND CODE
// Add this code to your Framer site where you want to handle the "Proceed to Payment" button click

// File: stripe-checkout.js
// This code should be added to your Framer project

/**
 * Handles the form submission and redirects to Stripe checkout
 * @param {Object} formData - The collected form data from your multi-step form
 */
async function handleProceedToPayment(formData) {
  try {
    // Replace with your actual API endpoint where you'll host the backend code
    const apiUrl = 'https://your-api-endpoint.com/create-checkout-session';
    
    // Send the form data to your backend
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Add your product/service details
        productName: 'Your Product/Service',
        productPrice: 2999, // Price in cents (e.g., $29.99)
        
        // Customer info from form
        customerName: formData.name,
        customerEmail: formData.email,
        
        // Any additional form data as metadata
        metadata: {
          preferences: formData.preferences,
          notes: formData.notes,
          // Add any other form fields you collect
        }
      }),
    });

    const { checkoutUrl } = await response.json();
    
    // Redirect to Stripe Checkout
    window.location.href = checkoutUrl;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    // Handle error appropriately (show error message to user)
  }
}

// Example usage in your Framer component:
// Assuming you have a button with onClick handler in your last form step
// <button onClick={() => handleProceedToPayment(formData)}>Proceed to Payment</button>

// You'll also need a success page in your Framer site
// The URL should match what you configure in your backend


// PART 2: BACKEND API CODE
// Create a file named server.js and host it on Vercel, Netlify, or any Node.js hosting

// File: server.js
// This should be hosted on a server (Vercel, Netlify, etc.)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { google } = require('googleapis');

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(bodyParser.json());
// Add a route for the root path
app.get('/', (req, res) => {
  res.send('Form payment integration API is running. Use /create-checkout-session to create a payment.');
});

// Create a checkout session endpoint
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { 
      productName, 
      productPrice, 
      customerName, 
      customerEmail, 
      metadata 
    } = req.body;

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
            unit_amount: productPrice,
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
        // This metadata will be accessible in the webhook
      },
    });

    // Return the checkout URL to the frontend
    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// PART 3: WEBHOOK HANDLER
// This endpoint will receive events from Stripe after payment

// Webhook endpoint to handle successful payments
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
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
    
    // Now you can:
    // 1. Store data in Google Sheets
    await storeDataInGoogleSheets(formData);
    
    // 2. And/or send data via email
    await sendDataViaEmail(formData);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({ received: true });
});

// Function to store data in Google Sheets
async function storeDataInGoogleSheets(formData) {
  try {
    // Set up Google Sheets API
    // You'll need to create service account credentials and share your sheet with the service account
    const auth = new google.auth.GoogleAuth({
      keyFile: 'path/to/your-service-account-key.json', // You'll create this later
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
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
      ]
    ];
    
    // Append data to the Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: 'YOUR_SPREADSHEET_ID', // You'll replace this with your sheet ID
      range: 'Sheet1!A:H', // Adjust range as needed
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    
    console.log('Data stored in Google Sheets successfully');
  } catch (error) {
    console.error('Error storing data in Google Sheets:', error);
  }
}

// Function to send data via email
async function sendDataViaEmail(formData) {
  // You can use a service like SendGrid, Mailgun, or nodemailer
  // Implementation will depend on your preferred email service
  
  // Example with nodemailer:
  /*
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'your-email@example.com',
    subject: 'New Form Submission with Payment',
    html: `
      <h2>New Form Submission</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Payment Status:</strong> ${formData.paymentStatus}</p>
      <p><strong>Payment ID:</strong> ${formData.paymentId}</p>
      <p><strong>Amount Paid:</strong> $${formData.paymentAmount}</p>
      <p><strong>Preferences:</strong> ${formData.preferences || 'Not provided'}</p>
      <p><strong>Notes:</strong> ${formData.notes || 'Not provided'}</p>
    `,
  };
  
  await transporter.sendMail(mailOptions);
  console.log('Email sent successfully');
  */
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for serverless functions (e.g., Vercel, Netlify)
module.exports = app;
