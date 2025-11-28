// Import Express.js
const express = require('express');
const axios = require('axios');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// Store to track first messages with conversation context
const conversationTracker = new Map();

// Your welcome template message
const welcomeTemplate = {
  type: 'template',
  template: {
    name: 'premiere_assistance',
    "language": { "code": "fr" },
    "components": [
        {
            "type": "BODY",
            "parameters": [
                { "type": "text", "text": "Amandine" },
            ]
        }
    ]
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      ...message
    };

    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Message sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Function to check if it's a new conversation
function isNewConversation(phoneNumber, messageContext, conversationId) {
  // Si pas de contexte, c'est probablement un nouveau message
  if (!messageContext) {
    console.log(`No context found for ${phoneNumber} - treating as new conversation`);
    return true;
  }

  // Si on n'a jamais vu cet utilisateur
  if (!conversationTracker.has(phoneNumber)) {
    console.log(`First time seeing ${phoneNumber} - new conversation`);
    return true;
  }

  const lastConversation = conversationTracker.get(phoneNumber);
  
  // Si l'ID de conversation a changé ou n'existe plus, c'est une nouvelle conversation
  if (conversationId && lastConversation.conversationId !== conversationId) {
    console.log(`Conversation ID changed for ${phoneNumber}: ${lastConversation.conversationId} -> ${conversationId}`);
    return true;
  }

  // Si le contexte indique que c'est un message sans réponse à un message précédent
  if (!messageContext.from && !messageContext.id) {
    console.log(`No message context reference for ${phoneNumber} - might be new conversation`);
    return true;
  }

  return false;
}

// Function to track conversation
function trackConversation(phoneNumber, messageContext, conversationId) {
  conversationTracker.set(phoneNumber, {
    conversationId: conversationId,
    context: messageContext,
    lastMessageTime: Date.now()
  });
}

// Route for GET requests (webhook verification)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests (webhook messages)
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  try {
    // Check if this is a message webhook
    if (req.body.object === 'whatsapp_business_account') {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (value?.messages) {
        const message = value.messages[0];
        const from = message.from; // Phone number of sender
        const messageId = message.id;
        const messageType = message.type;
        const messageContext = message.context; // Context of the message (reply info, etc.)
        
        // Get conversation ID from metadata if available
        const conversationId = value?.metadata?.phone_number_id || phoneNumberId;

        console.log(`Message from ${from}, type: ${messageType}, ID: ${messageId}`);
        console.log(`Context:`, messageContext ? JSON.stringify(messageContext, null, 2) : 'No context');

        // Check if this is a new conversation
        if (isNewConversation(from, messageContext, conversationId)) {
          console.log(`🆕 New conversation detected from ${from}, sending welcome template...`);
          
          try {
            // Send welcome template
            await sendWhatsAppMessage(from, welcomeTemplate);
            
            // Track this conversation
            trackConversation(from, messageContext, conversationId);
            
            console.log(`✅ Welcome template sent to ${from}`);
          } catch (error) {
            console.error(`❌ Failed to send welcome template to ${from}:`, error.message);
          }
        } else {
          console.log(`📝 Continuing conversation with ${from}, no template sent`);
          
          // Update conversation tracking
          trackConversation(from, messageContext, conversationId);
        }
      }

      // Handle status updates (message delivery, read, etc.)
      if (value?.statuses) {
        const status = value.statuses[0];
        console.log(`Status update: ${status.status} for message ${status.id}`);
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error.message);
  }

  res.status(200).end();
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    trackedConversations: conversationTracker.size,
    conversations: Array.from(conversationTracker.entries()).map(([phone, data]) => ({
      phone,
      conversationId: data.conversationId,
      lastMessageTime: new Date(data.lastMessageTime).toISOString()
    }))
  });
});

// Route to reset tracking (for testing)
app.post('/reset-tracking', (req, res) => {
  conversationTracker.clear();
  console.log('Conversation tracking reset');
  res.status(200).json({ message: 'Conversation tracking reset successfully' });
});

// Route to reset specific user (for testing)
app.post('/reset-user/:phoneNumber', (req, res) => {
  const phoneNumber = req.params.phoneNumber;
  conversationTracker.delete(phoneNumber);
  console.log(`Conversation tracking reset for user: ${phoneNumber}`);
  res.status(200).json({ 
    message: `Conversation tracking reset successfully for ${phoneNumber}`,
    phoneNumber: phoneNumber
  });
});

// Start the server
app.listen(port, () => {
  console.log(`\n🚀 WhatsApp Webhook listening on port ${port}`);
  console.log(`📋 Health check available at: http://localhost:${port}/health`);
  console.log(`🔄 Reset tracking at: POST http://localhost:${port}/reset-tracking`);
  console.log(`👤 Reset specific user at: POST http://localhost:${port}/reset-user/{phoneNumber}\n`);
});
