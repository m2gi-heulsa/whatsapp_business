// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// Mémoire locale : clientId → timestamp du dernier message de bienvenue envoyé
const lastGreetingSent = {};

// Message/template à envoyer
const greetingMessage = {
  text: {
    body : "Bonjour, que pouvons-nous faire pour vous ?" 
  }
};

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

// Route for POST requests
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).end();

   // Vérifie que c'est bien un message entrant
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message || message.type !== "text") {
    return; // Pas de message texte → on ignore
  }

  const clientId = message.from; // numéro du client

  // Vérifier la dernière fois qu'on lui a envoyé le message d'accueil
  const now = Date.now();
  const lastTime = lastGreetingSent[clientId] || 0;

  // 24h = 86400000 ms
  const twentyFourHours = 24 * 60 * 60 * 1000;

  const needGreeting = now - lastTime > twentyFourHours;

  if (needGreeting) {
    await sendWhatsAppMessage(clientId, greetingMessage);
    lastGreetingSent[clientId] = now;
  }

  // Sinon : ne rien faire
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
