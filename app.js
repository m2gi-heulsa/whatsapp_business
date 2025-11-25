// Import Express.js et Axios
const express = require('express');
const axios = require('axios');

// Crée l'application Express
const app = express();
app.use(express.json());

// Port et verify token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Stocker les utilisateurs déjà contactés
const contactedUsers = new Set();

// Route GET pour vérifier le webhook
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route POST pour recevoir les messages
app.post('/', async (req, res) => {
  console.log('\nWebhook received:\n', JSON.stringify(req.body, null, 2));

  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value.messages || [];
        for (const message of messages) {
          const from = message.from;

          // Premier message du client
          if (!contactedUsers.has(from)) {
            contactedUsers.add(from);

            // Envoi du template "premiere_assistance"
            await axios.post(
              `https://graph.facebook.com/v22.0/839608629240039/messages`,
              {
                messaging_product: "whatsapp",
                to: from,
                type: "template",
                template: {
                  name: "premiere_assistance",
                  language: { code: "fr" },
                  components: [
                    {
                      type: "BODY",
                      parameters: [
                        { type: "text", text: "Amandine" }
                      ]
                    }
                  ]
                }
              },
              {
                headers: {
                  "Authorization": "`Bearer ${verifyToken}`",
                  "Content-Type": "application/json"
                }
              }
            );

            console.log(`Template sent to ${from}`);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error sending template:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
