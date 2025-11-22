// api/lannaex-business-ai.js

const OpenAI = require("openai");
const { buildBusinessSystemPrompt } = require("./utils/_lannaex-utils");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // Basic CORS for Shopify/browser calls
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
      try {
        body = JSON.parse(body);
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in body" });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Body must be a JSON object" });
    }

    const userMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    // Load correct Lannaex Business prompt
    const systemPrompt = buildBusinessSystemPrompt();

    // -------------------------
    // Build history messages for Responses API
    // -------------------------
    const historyMessages = history
      .filter((h) => h && typeof h.content === "string")
      .map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: "input_text",
            text: h.content,
          },
        ],
      }));

    // -------------------------
    // Build current user content (text + attachments)
    // -------------------------
    const contentParts = [
      {
        type: "input_text",
        text: userMessage,
      },
    ];

    const nonImageSummaries = [];

    attachments.forEach((att, index) => {
      if (!att || !att.data || !att.type) return;

      const mime = String(att.type);
      const name = String(att.name || `file-${index + 1}`);

      if (mime.startsWith("image/")) {
        // Vision: inline as data URL
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image: describe to model
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (you cannot see their raw content, but you can reference them conceptually):\n" +
          nonImageSummaries.map((s) => "- " + s).join("\n"),
      });
    }

    // -------------------------
    // Call OpenAI Responses API (multimodal)
    // -------------------------
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt,
            },
          ],
        },
        ...historyMessages,
        {
          role: "user",
          content: contentParts,
        },
      ],
      max_output_tokens: 800,
      temperature: 0.7,
    });

    // -------------------------
    // Extract reply text
    // -------------------------
    let reply =
      "I’m not sure what to say yet — try asking with a bit more detail about your business.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const firstContent = response.output[0].content.find(
        (c) => c.type === "output_text"
      );
      if (
        firstContent &&
        firstContent.text &&
        typeof firstContent.text.value === "string"
      ) {
        reply = firstContent.text.value.trim();
      }
    }

    // For now, no backend-generated files yet → empty array
    const files = [];

    return res.status(200).json({
      reply,
      files,
    });
  } catch (err) {
    console.error("Lannaex Business AI backend error:", err);
    return res.status(500).json({
      error: "Business AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
