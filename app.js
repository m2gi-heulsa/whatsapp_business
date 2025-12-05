// Import Express.js
const express = require('express');

// Import axios
const axios = require('axios');

// Create an Express app
const app = express();

// Import CORS
const cors = require('cors');

// Middleware to parse JSON bodies
app.use(express.json());

// Activate cors
app.use(cors());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// Mémoire locale : clientId → timestamp du dernier message de bienvenue envoyé
const lastGreetingSent = {};

// Message/template à envoyer
const greetingMessage = (name) => ({
  type: 'template',
    template: {
      name: 'premiere_assistance2',
      language: { 
        code: "fr" 
      },
      components: [
        {
          type: "body",
          parameters: [
            { 
              type: "text", 
              text: name
            }
          ]
        }
      ]
    }
  });

// Fonction utilitaire : envoyer un message WhatsApp
async function sendWhatsAppMessage(to, playload) {
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        to,
        ...playload // message/template à envoyer
      }
    });

    console.log("Message envoyé à", to);
  } catch (err) {
    console.error("Erreur en envoyant le message :", err.response?.data || err);
  }
}

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

const fs = require('fs');
const path = require('path');

// Fichier pour stocker les conversations
const conversationsFile = path.join(__dirname, 'conversations.json');

// Fonction pour charger les conversations
function loadConversations() {
  try {
    if (!fs.existsSync(conversationsFile)) {
      return [];
    }
    const data = fs.readFileSync(conversationsFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erreur chargement conversations:', err);
    return [];
  }
}

// Fonction pour sauvegarder les conversations
function saveConversations(conversations) {
  try {
    fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2), 'utf8');
    console.log('Conversations sauvegardées');
  } catch (err) {
    console.error('Erreur sauvegarde conversations:', err);
  }
}

// Route for POST requests
app.post('/',async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).end();

   // Vérifie que c'est bien un message entrant
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message) {
    return; // Pas de message texte → on ignore
  }

  const clientId = message.from; // numéro du client

  // Récupération du nom whatsapp du client
  const name = changes.value.contacts?.[0]?.profile?.name || "👋";

  // 📝 ENREGISTRER LE MESSAGE DANS LES CONVERSATIONS
  const conversations = loadConversations();
  let conversation = conversations.find(c => c.PhoneNumber === clientId);
  
  if (!conversation) {
    conversation = {
      PhoneNumber: clientId,
      Name: name,
      Messages: [],
      UnreadCount: 0
    };
    conversations.push(conversation);
  } else {
    // Mettre à jour le nom si c'était juste un emoji
    if (conversation.Name === "👋" && name !== "👋") {
      conversation.Name = name;
    }
  }
  
  // Ajouter le message
  const messageText = message.text?.body || 
                     (message.type === "button" ? `[Bouton: ${message.button?.text}]` : 
                     `[Message ${message.type}]`);
  
  conversation.Messages.push({
    Id: message.id,
    From: "customer",
    Text: messageText,
    Timestamp: new Date().toISOString()
  });
  conversation.UnreadCount++;
  
  saveConversations(conversations);
  console.log(`💬 Message sauvegardé de ${name} (${clientId})`);

  // Vérifier la dernière fois qu'on lui a envoyé le message d'accueil
  const now = Date.now();
  const lastTime = lastGreetingSent[clientId] || 0;

  // 24h = 86400000 ms
  const twentyFourHours = 24 * 60 * 60 * 1000;

  const needGreeting = now - lastTime > twentyFourHours;

  if (needGreeting) {
    await sendWhatsAppMessage(clientId, greetingMessage(name));
    lastGreetingSent[clientId] = now;
    return; // on ne traite pas encore la sélection de bouton à ce moment
  }

  // Ensuite, si le message reçu est un bouton :
  if (message.type === "button") {
    const selectedPayload = message.button.payload;

    if (selectedPayload === "Contacter un commercial") {
      await sendWhatsAppMessage(clientId, {
        text: {
          body: "Un commercial va venir vous répondre."
        }
      });
    }
  }
});

// AJOUTER cette nouvelle route pour récupérer les conversations
app.get('/conversations', (req, res) => {
  try {
    const conversations = loadConversations();
    // Trier par date du dernier message
    conversations.sort((a, b) => {
      const aTime = a.Messages.length > 0 ? new Date(a.Messages[a.Messages.length - 1].Timestamp) : new Date(0);
      const bTime = b.Messages.length > 0 ? new Date(b.Messages[b.Messages.length - 1].Timestamp) : new Date(0);
      return bTime - aTime;
    });
    res.json(conversations);
  } catch (err) {
    console.error('Erreur get conversations:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// AJOUTER cette route pour envoyer des messages texte depuis l'interface
app.post('/send-text-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber et message requis' });
    }

    // Envoyer le message via WhatsApp
    await sendWhatsAppMessage(phoneNumber, {
      text: { body: message }
    });

    // Enregistrer dans les conversations
    const conversations = loadConversations();
    let conversation = conversations.find(c => c.PhoneNumber === phoneNumber);
    
    if (conversation) {
      conversation.Messages.push({
        Id: `msg_${Date.now()}`,
        From: "business",
        Text: message,
        Timestamp: new Date().toISOString()
      });
      saveConversations(conversations);
    }

    console.log(`📤 Message envoyé à ${phoneNumber}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur envoi message:', err);
    res.status(500).json({ error: err.message });
  }
});

// AJOUTER cette route pour marquer les messages comme lus
app.post('/mark-as-read', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber requis' });
    }

    const conversations = loadConversations();
    const conversation = conversations.find(c => c.PhoneNumber === phoneNumber);
    
    if (conversation) {
      conversation.UnreadCount = 0;
      saveConversations(conversations);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur mark as read:', err);
    res.status(500).json({ error: err.message });
  }
});

// AJOUTER cette route pour supprimer une conversation
app.post('/delete-conversation', (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber requis' });
    }

    const conversations = loadConversations();
    const filtered = conversations.filter(c => c.PhoneNumber !== phoneNumber);
    
    saveConversations(filtered);
    
    console.log(`🗑️ Conversation supprimée: ${phoneNumber}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur suppression conversation:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
