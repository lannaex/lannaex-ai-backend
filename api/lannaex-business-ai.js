// api/lannaex-business-ai.js

const {
  buildBusinessSystemPrompt,
  runLannaexChat,
} = require("./utils/_lannaex-utils");

module.exports = async (req, res) => {
  // Basic CORS for Shopify browser calls
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
    }

  try {
    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const userMessage = body.message || "";
    const history = body.history || [];
    const attachments = body.attachments || [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    // Load correct Lannaex Business prompt
    const systemPrompt = buildBusinessSystemPrompt();

    // Run the chat through shared engine
    const { reply, files } = await runLannaexChat({
      userMessage,
      history,
      attachments,
      systemPrompt,
    });

    // Return AI reply and any processed file URLs
    return res.status(200).json({
      reply,
      files: files || [],
    });

  } catch (err) {
    console.error("Lannaex Business AI error:", err);
    return res.status(500).json({
      error: "Business AI backend failed.",
      details: err.message || String(err),
    });
  }
};
