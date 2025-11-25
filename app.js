// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

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
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  // Récupération de l'événement principal
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  
  // Numéro du client et du numéro business
  const userNumber = value?.contacts?.[0]?.wa_id || value?.messages?.[0]?.from;
  const phoneNumberId = value?.metadata?.phone_number_id;
  
  if (!userNumber) {
    res.sendStatus(200);
    return;
  }

  // Message texte classique
  if (message?.type === "text") {
  console.log("📩 Message reçu de :", userNumber);
}

  if (value.type === "request_welcome") {
    console.log("✨ Request welcome reçu de :", userNumber);
  try {
    await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.VERIFY_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: userNumber,
          type: "text",
          text: { body: "Bonjour ! Bienvenue sur notre service. Comment pouvons-nous vous aider ?" }
        })
      }
    );
    console.log("✔ Message de bienvenue envoyé !");
  } catch (err) {
    console.error("❌ Erreur en envoyant le message de bienvenue :", err);
  }
}

  res.sendStatus(200);
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
