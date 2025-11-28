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
    language: { 
      code: "fr" 
    },
    components: [
      {
        type: "body",
        parameters: [
          { 
            type: "text", 
            text: "Amandine" 
          }
        ]
      }
    ]
  }
};

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
function isNewConversation(phoneNumber, messageContext) {
  // Si on n'a jamais vu cet utilisateur
  if (!conversationTracker.has(phoneNumber)) {
    return true;
  }
  
  // Si pas de contexte de message (pas de réponse à un message précédent)
  // ET pas de référence à une conversation existante
  // Cela peut indiquer une nouvelle conversation après suppression
  if (!messageContext || (!messageContext.from && !messageContext.id)) {
    console.log(`🔄 No message context for ${phoneNumber} - might be new conversation after deletion`);
    return true;
  }
  
  return false;
}

// Function to track conversation with more details
function trackConversation(phoneNumber, messageContext) {
  conversationTracker.set(phoneNumber, { 
    timestamp: Date.now(),
    templateSent: true,
    lastContext: messageContext,
    messageCount: (conversationTracker.get(phoneNumber)?.messageCount || 0) + 1
  });
}

// Route for POST requests (webhook messages) - version améliorée
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
        const from = message.from;
        const messageContext = message.context;
        const messageType = message.type;
        
        console.log(`📨 Message from ${from}, type: ${messageType}`);
        console.log(`📄 Context:`, messageContext ? JSON.stringify(messageContext, null, 2) : 'No context');
        
        // Check if this is a new conversation
        if (isNewConversation(from, messageContext)) {
          console.log(`🆕 NEW/RESET conversation detected for ${from} - sending welcome template...`);
          
          try {
            await sendWhatsAppMessage(from, welcomeTemplate);
            trackConversation(from, messageContext);
            console.log(`✅ Welcome template sent to ${from}`);
          } catch (error) {
            console.error(`❌ Failed to send welcome template to ${from}:`, error.message);
          }
        } else {
          console.log(`📝 Continuing conversation with ${from} - no template sent`);
          // Update tracking without sending template
          const existing = conversationTracker.get(from);
          if (existing) {
            existing.messageCount++;
            existing.lastContext = messageContext;
            existing.timestamp = Date.now();
          }
        }
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

// Route to reset specific user (for testing)
app.post('/reset-user/:phoneNumber', (req, res) => {
  const phoneNumber = req.params.phoneNumber;
  if (conversationTracker.has(phoneNumber)) {
    conversationTracker.delete(phoneNumber);
    console.log(`✅ Conversation tracking reset for user: ${phoneNumber}`);
    res.status(200).json({ 
      message: `Conversation tracking reset successfully for ${phoneNumber}`,
      phoneNumber: phoneNumber
    });
  } else {
    res.status(404).json({ 
      message: `No tracking found for ${phoneNumber}`,
      phoneNumber: phoneNumber
    });
  }
});

// Route to see all tracked users
app.get('/tracked-users', (req, res) => {
  const users = Array.from(conversationTracker.entries()).map(([phone, data]) => ({
    phoneNumber: phone,
    timestamp: new Date(data.timestamp).toISOString(),
    templateSent: data.templateSent
  }));
  
  res.status(200).json({
    totalUsers: users.length,
    users: users
  });
});

// Start the server
app.listen(port, () => {
  console.log(`\n🚀 WhatsApp Webhook listening on port ${port}`);
  console.log(`📋 Health check available at: http://localhost:${port}/health`);
  console.log(`🔄 Reset tracking at: POST http://localhost:${port}/reset-tracking`);
  console.log(`👤 Reset specific user at: POST http://localhost:${port}/reset-user/{phoneNumber}\n`);
});
