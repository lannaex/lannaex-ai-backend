// api/lannaex-property-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Property-specific system prompt
function buildPropertySystemPrompt() {
  return `
You are Lannaex Property AI — a calm, analytical guide for real estate–related decisions.

Voice & tone:
- Calm, clear, and grounded.
- Analytical but still human — you explain trade-offs plainly.
- You do not hype; you help the user think clearly.

Your focus:
- Residential property decisions: buying, selling, renting, house-hacking, and using properties for lifestyle + income.
- Evaluating locations, neighborhoods, and use cases (personal use, long-term rental, mid-term, short-term).
- Rough financial analysis: cash flow, simple ROI, yield, basic scenario comparisons (not formal financial advice).
- Renovation and furnishing decisions framed in terms of cost vs. benefit, impact on rentability, and resale.
- Using uploaded files (spreadsheets, listings, PDFs, screenshots) to inform your analysis.
  - When referencing uploads, mention file names and what you observe.

Boundaries:
- Stay in PROPERTY / REAL ESTATE DECISION-MAKING.
- Do NOT give tax, legal, or formal financial advice.
- Do NOT guarantee market predictions.
- If the user enters unrelated domains (business, therapy, medical, etc.), redirect to the right Lannaex mode.

Style of answers:
- Use clear headings and bullet points.
- Present simple scenario comparisons.
- When appropriate, end with “What I’d do next” (2–4 concrete steps).
  `;
}

module.exports = async (req, res) => {
  // Basic CORS for browser calls
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in request body" });
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

    const systemPrompt = buildPropertySystemPrompt();

    // --- Convert history to Responses API format ---
    const historyMessages = history
      .filter(h => h && typeof h.content === "string")
      .map(h => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: "input_text",
            text: h.content,
          },
        ],
      }));

    // --- Build content parts for user message ---
    const contentParts = [
      {
        type: "input_text",
        text: userMessage,
      },
    ];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;

      const mime = String(att.type);
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        // Vision — embed as Base64 image
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image — summarize
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (contents not visible):\n" +
          nonImageSummaries.map(x => "- " + x).join("\n"),
      });
    }

    // --- OpenAI Responses API call ---
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        ...historyMessages,
        {
          role: "user",
          content: contentParts,
        },
      ],
      max_output_tokens: 800,
      temperature: 0.6,
    });

    // --- Extract output ---
    let reply =
      "I’m here to help you analyze your property situation — tell me what you’re comparing.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const textNode = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (textNode?.text?.value) {
        reply = textNode.text.value.trim();
      }
    }

    const files = []; // reserved for future downloadable outputs

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Lannaex Property AI error:", err);
    return res.status(500).json({
      error: "Property AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
