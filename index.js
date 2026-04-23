const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "zeroair2024",
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || "",
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  NUMERO_ANDRES: process.env.NUMERO_ANDRES || "524442358036",
};

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de Zero Air. Responde siempre de forma amable, breve y clara. Usa un tono cercano pero profesional.

PRODUCTO:
- Kit de bienvenida: $1,150 MXN
- Incluye: 1 inhalador (no caduca) + 1 sobre de menta + 1 sobre de mango
- Cada sobre incluye 3 filtros. Cada filtro dura minimo 1 semana, cada sobre dura minimo 3 semanas en uso normal
- Los filtros estan hechos de aceite de girasol o cacahuate con saborizante natural. No son daninos para la salud. Los filtros son una fibra esponjosa que lleva el sabor como liquido dentro de esta fibra que lo absorbe, y contiene solo 2% de saborizante, lo demas es 98% aceite de girasol o de cacahuate.
- Es una alternativa saludable al vapeo y una buena opcion para disminuir la ansiedad que genera el dejar de fumar cigarros o vapes.

FILTROS PROXIMOS (en aproximadamente 2 semanas):
- Nuevos sabores: fresa, sandia y mora azul
- Si preguntan por estos sabores, diles que estaran disponibles muy pronto y que los contactaran cuando esten listos

COMO COMPRAR - PICKUP (opcion principal):
-Tenemos pagina de instagram zeroairmx es el perfil y pagina web zeroair.mx Por el momento el instagram te lleva a este chat para que con la ayuda del chat se cierre la venta. y la pagina web no tiene producto como disponible para compra ya que por el momento estamos vendiendo solo en san luis potosi, pero en un mes salimos a venta a nivel nacional.
- Restaurante Saigon, Juan de Onate 620, frente a la Casa de la Cultura, San Luis Potosi. Horario: 11am a 10pm todos los dias
- Restaurante La Viga, Cordillera Oriental 430, frente al Oxxo. Horario: 2pm a 11pm todos los dias
- Formas de pago: tarjeta de credito y efectivo (no transferencias)
- Mas info: https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:54a827eb-99a5-4d1b-8528-815fe28844da

ENVIO A DOMICILIO (opcion secundaria):
- Disponible dentro de un radio de 7 km del Restaurante Saigon en San Luis Potosi
- Sin costo adicional (total: $1,150 MXN)
- Si el cliente pide envio, sigue este flujo en orden:
  PASO 1: Confirma que el envio es gratis pero solo dentro de 7 km del Restaurante Saigon
  PASO 2: Pregunta su direccion completa (calle, numero, colonia, referencias)
  PASO 3: Pregunta su forma de pago (tarjeta o efectivo)
  PASO 4: Muestra un resumen claro: producto, direccion, forma de pago y total
  PASO 5: Dile que en breve lo contactaran para confirmar su pedido
  PASO 6: Al final de tu mensaje agrega exactamente esto en linea separada: ##PEDIDO_DOMICILIO##

FLUJO GENERAL:
- Primer mensaje: saluda con Gracias por comunicarte con Zero Air. Como podemos ayudarte?
- Responde dudas con la info real de arriba
- Al finalizar pregunta si tiene mas dudas
- Despedida: Muchas gracias por preferirnos! Esperamos poder servirte nuevamente

Si te preguntan algo que no esta en esta informacion, responde: Dejame verificar esa informacion y te confirmo en breve, y agrega exactamente esto en linea separada: ##PREGUNTA_SIN_RESPUESTA##
Nunca inventes informacion que no este aqui.`;

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
    console.log("Webhook verificado por Meta");
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

    let respuesta = respuestaIA.data.content[0].text;
    historial.push({ role: "assistant", content: respuesta });
    if (historial.length > 20) historial.splice(0, 2);

    const esPedido = respuesta.includes("##PEDIDO_DOMICILIO##");
const esPreguntaSinRespuesta = respuesta.includes("##PREGUNTA_SIN_RESPUESTA##");
respuesta = respuesta.replace("##PEDIDO_DOMICILIO##", "").replace("##PREGUNTA_SIN_RESPUESTA##", "").trim();

    await enviarMensaje(telefono, respuesta);
    console.log("Respuesta enviada a " + telefono);

    if (esPedido) {
      const historialTexto = historial
        .map(m => (m.role === "user" ? "Cliente: " : "Bot: ") + m.content)
        .join("\n");
      const notificacion = "NUEVO PEDIDO A DOMICILIO\nCliente: " + telefono + "\n\n" + historialTexto;
      await enviarMensaje(CONFIG.NUMERO_ANDRES, notificacion);
      console.log("Notificacion enviada a Andres");
    }
 if (esPreguntaSinRespuesta) {
      const ultimaPregunta = historial.filter(m => m.role === "user").slice(-1)[0]?.content || "pregunta desconocida";
      const alerta = "ALERTA Zero Air - Pregunta sin respuesta\nCliente: " + telefono + "\nPregunta: " + ultimaPregunta;
      await enviarMensaje(CONFIG.NUMERO_ANDRES, alerta);
      console.log("Alerta enviada a Andres");
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
});

async function enviarMensaje(telefono, texto) {
  await axios.post(
    "https://graph.facebook.com/v19.0/" + CONFIG.PHONE_NUMBER_ID + "/messages",
    {
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: texto },
    },
    {
      headers: {
        Authorization: "Bearer " + CONFIG.WHATSAPP_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot Zero Air corriendo en puerto " + PORT);
});
