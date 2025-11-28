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

// Store to track conversations
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
  // Si on n'a jamais vu cet utilisateur
  if (!conversationTracker.has(phoneNumber)) {
    return true;
  }
  
  const existing = conversationTracker.get(phoneNumber);
  
  // Si l'ID de conversation a changé (conversation supprimée puis recréée)
  if (conversationId && existing.conversationId && existing.conversationId !== conversationId) {
    console.log(`🔄 Conversation ID changed for ${phoneNumber}: ${existing.conversationId} -> ${conversationId}`);
    return true;
  }
  
  // Si pas de contexte de message (nouveau thread)
  if (!messageContext) {
    const timeSinceLastMessage = Date.now() - existing.timestamp;
    // Si plus de 5 minutes sans contexte = probablement nouvelle conversation
    if (timeSinceLastMessage > 5 * 60 * 1000) {
      console.log(`🔄 No context after 5+ minutes for ${phoneNumber} - treating as new conversation`);
      return true;
    }
  }
  
  return false;
}

// Function to track conversation
function trackConversation(phoneNumber, conversationId = null) {
  conversationTracker.set(phoneNumber, { 
    timestamp: Date.now(),
    templateSent: true,
    conversationId: conversationId || 'unknown'
  });
}

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
        const from = message.from;
        const messageContext = message.context;
        
        // Essayer de récupérer un ID de conversation
        const conversationId = value?.metadata?.phone_number_id || message.id?.substring(0, 10);
        
        console.log(`📨 Message from ${from}`);
        console.log(`📄 Context:`, messageContext ? 'Present' : 'None');
        console.log(`🆔 Conversation ID:`, conversationId);
        
        // Vérifier si c'est une nouvelle conversation
        if (isNewConversation(from, messageContext, conversationId)) {
          console.log(`🆕 NEW/RESET conversation detected for ${from} - sending welcome template...`);
          
          try {
            await sendWhatsAppMessage(from, welcomeTemplate);
            trackConversation(from, conversationId);
            console.log(`✅ Welcome template sent to ${from}`);
          } catch (error) {
            console.error(`❌ Failed to send welcome template:`, error.message);
          }
        } else {
          console.log(`👋 CONTINUING conversation with ${from} - no template sent`);
          // Mettre à jour le timestamp
          const existing = conversationTracker.get(from);
          if (existing) {
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
      lastMessageTime: new Date(data.timestamp).toISOString(),
      templateSent: data.templateSent,
      conversationId: data.conversationId
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
    templateSent: data.templateSent,
    conversationId: data.conversationId
  }));
  
  res.status(200).json({
    totalUsers: users.length,
    users: users
  });
});

// Route to reset all tracking
app.post('/reset-tracking', (req, res) => {
  conversationTracker.clear();
  console.log('All conversation tracking reset');
  res.status(200).json({ message: 'All conversation tracking reset successfully' });
});

// Start the server
app.listen(port, () => {
  console.log(`\n🚀 WhatsApp Webhook listening on port ${port}`);
  console.log(`📋 Health check: GET /health`);
  console.log(`👥 View tracked users: GET /tracked-users`);
  console.log(`🔄 Reset all tracking: POST /reset-tracking`);
  console.log(`👤 Reset specific user: POST /reset-user/{phoneNumber}\n`);
});
