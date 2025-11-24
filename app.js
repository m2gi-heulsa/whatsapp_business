// Import
const express = require('express');
const axios = require('axios');

// Create an Express app
const app = express();
app.use(express.json());

// ENV variables
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Validate GET / webhook
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': tokenQuery } = req.query;

  if (mode === 'subscribe' && tokenQuery === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// POST / webhook handler
app.post('/', async (req, res) => {
  const body = req.body;
  console.log("\n\n📩 Webhook reçu:\n", JSON.stringify(body, null, 2));

  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message) {
      const from = message.from; // numéro du client
      const type = message.type;

      console.log("Message reçu de :", from);
      console.log("Type :", type);

      // CAS : le client ouvre une nouvelle conversation
      if (type === "request_welcome") {
        console.log("✨ L'utilisateur ouvre une nouvelle conversation");

        // Envoyer uniquement le message de bienvenue
        await axios.post(
          `https://graph.facebook.com/v20.0/839608629240039/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: "Bonjour, comment pouvons-nous vous aider ?" }
          },
          { headers: { Authorization: `Bearer ${verifyToken}` } }
        );
        console.log("✔ Message d’accueil envoyé");
      }

      // CAS : Le client envoie un vrai message texte
      if (type === "text") {
        console.log("💬 Message texte reçu du client :", message.text?.body);
        // Ici tu peux gérer les réponses automatiques si besoin
      }
    }
  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
  }

  res.sendStatus(200);
});

// Start server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
