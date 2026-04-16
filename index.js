const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "zeroair2024",
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || "",
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
};

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de Zero Air. Responde siempre de forma amable, breve y clara.

PRODUCTO: Kit de bienvenida $1,150 MXN. Incluye inhalador (no caduca) + sobre de menta (1 mes) + sobre de mango (1 mes). Alternativa al vapeo.

COMPRA: Solo pick up. Restaurante Saigon, Juan de Oñate 620, frente a Casa de la Cultura, SLP. Horario 11am-10pm. Pago: tarjeta o efectivo. Mapa: https://maps.app.goo.gl/MmUSMmKPPLJTdLpK9

Saluda con: Gracias por comunicarte con Zero Air. Al despedirte di: Muchas gracias por preferirnos.`;

const conversaciones = {};

function getHistorial(telefono) {
  if (!conversaciones[telefono]) conversaciones[telefono] = [];
  return conversaciones[telefono];
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const mensaje = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensaje || mensaje.type !== "text") return;
    const telefono = mensaje.from;
    const texto = mensaje.text.body;
    console.log("Mensaje de " + telefono + ": " + texto);
    const historial = getHistorial(telefono);
    historial.push({ role: "user", content: texto });
    const respuestaIA = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: historial,
      },
      {
        headers: {
          "x-api-key": CONFIG.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );
    const respuesta = respuestaIA.data.content[0].text;
    historial.push({ role: "assistant", content: respuesta });
    if (historial.length > 20) historial.splice(0, 2);
    await axios.post(
      "https://graph.facebook.com/v19.0/" + CONFIG.PHONE_NUMBER_ID + "/messages",
      { messaging_product: "whatsapp", to: telefono, type: "text", text: { body: respuesta } },
      { headers: { Authorization: "Bearer " + CONFIG.WHATSAPP_TOKEN, "Content-Type": "application/json" } }
    );
    console.log("Respuesta enviada a " + telefono);
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot corriendo en puerto " + PORT);
});

