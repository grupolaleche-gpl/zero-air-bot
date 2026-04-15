const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const CONFIG = {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "zeroair2024",        // Token que tú inventas para verificar con Meta
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || "",               // Token de acceso de Meta (WhatsApp Business API)
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || "",             // ID del número de WhatsApp Business
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",         // Tu API key de Anthropic
};

// ─── PROMPT DEL BOT ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de Zero Air. Responde siempre de forma amable, breve y clara. Usa un tono cercano pero profesional.

INFORMACIÓN DEL PRODUCTO:
- Kit de bienvenida: $1,150 MXN
- Incluye: 1 inhalador (no caduca) + sobre de menta (dura ~1 mes) + sobre de mango (dura ~1 mes)
- Es un producto de bienestar, alternativa al vapeo

CÓMO COMPRAR:
- Solo pick up por ahora (no hay envíos a domicilio)
- Punto de recogida: Restaurante Saigon, Juan de Oñate 620, frente a la Casa de la Cultura, San Luis Potosí
- Horario: 11am a 10pm todos los días
- Formas de pago: tarjeta de crédito y efectivo (no se aceptan transferencias)
- Ubicación en mapa: https://maps.app.goo.gl/MmUSMmKPPLJTdLpK9
- Más info del producto: https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:54a827eb-99a5-4d1b-8528-815fe28844da

FLUJO DE CONVERSACIÓN:
1. Si es el primer mensaje, saluda con: "Gracias por comunicarte con Zero Air. ¿Cómo podemos ayudarte?"
2. Responde la duda del cliente con la información real
3. Al finalizar pregunta si tiene más dudas
4. Despídete con: "¡Muchas gracias por preferirnos! Esperamos poder servirte nuevamente"

Si te preguntan algo que no sabes, responde: "Déjame verificar esa información y te confirmo en breve."
Nunca inventes información que no esté aquí.`;

// ─── MEMORIA DE CONVERSACIONES ────────────────────────────────────────────────
// Guarda el historial por número de teléfono (en memoria, se resetea al reiniciar)
const conversaciones = {};

function getHistorial(telefono) {
  if (!conversaciones[telefono]) conversaciones[telefono] = [];
  return conversaciones[telefono];
}

// ─── VERIFICACIÓN DE WEBHOOK (Meta lo llama una sola vez al configurar) ───────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── RECEPCIÓN DE MENSAJES ────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Meta espera respuesta 200 inmediata

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const mensaje = changes?.value?.messages?.[0];

    if (!mensaje || mensaje.type !== "text") return;

    const telefono = mensaje.from;
    const texto = mensaje.text.body;

    console.log(`📩 Mensaje de ${telefono}: ${texto}`);

    // Obtener historial del cliente
    const historial = getHistorial(telefono);
    historial.push({ role: "user", content: texto });

    // Llamar a Claude
    const respuestaIA = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
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

    // Limitar historial a últimos 20 mensajes para no exceder tokens
    if (historial.length > 20) historial.splice(0, 2);

    // Enviar respuesta por WhatsApp
    await enviarMensaje(telefono, respuesta);
    console.log(`✅ Respuesta enviada a ${telefono}`);

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
});

// ─── FUNCIÓN PARA ENVIAR MENSAJES ─────────────────────────────────────────────
async function enviarMensaje(telefono, texto) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ─── ARRANCAR SERVIDOR ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Zero Air WhatsApp Bot corriendo en puerto ${PORT}`);
});
