// api/lannaex-property-ai.js

const OpenAI = require("openai");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

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
- Evaluating locations, neighborhoods, and use cases.
- Rough financial analysis: cash flow, ROI, yield, simple scenario comparisons.
- Renovation and furnishing decisions in terms of cost vs benefit and impact on rentability/resale.
- Using uploaded files (spreadsheets, listings, PDFs, screenshots).

Boundaries:
- Stay in PROPERTY / REAL ESTATE.
- No tax, legal, or formal financial advice.
- No guaranteed market predictions.

Style:
- Clear headings + bullet points.
- Scenario comparisons.
- Finish with “What I’d do next” (2–4 steps).
  `;
}

module.exports = async (req, res) => {
  // CORS
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

    const rawMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!rawMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    const systemPrompt = buildPropertySystemPrompt();

    // ------------------------------------------------------
    // INTERNET SEARCH (same pattern as Business & Fashion)
    // ------------------------------------------------------
    let userMessage = rawMessage;

    if (shouldUseSearch(rawMessage)) {
      try {
        const searchResults = await webSearch(rawMessage);
        if (searchResults) {
          userMessage =
            rawMessage +
            "\n\n[Live web search results for context — use only if helpful:\n" +
            searchResults +
            "\n]";
        }
      } catch (searchErr) {
        console.error("Property AI web search error:", searchErr);
      }
    }

    // ------------------------------------------------------
    // Convert history for Responses API (multimodal-safe)
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // Build content parts (user text + file attachments)
    // ------------------------------------------------------
    const contentParts = [
      {
        type: "input_text",
        text: userMessage,
      },
    ];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;

      const mime = att.type + "";
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        // Vision
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "User also uploaded these non-image files (contents not visible):\n" +
          nonImageSummaries.map(f => "- " + f).join("\n"),
      });
    }

    // ------------------------------------------------------
    // OPENAI — Responses API
    // ------------------------------------------------------
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
      max_output_tokens: 900,
      temperature: 0.6,
    });

    // ------------------------------------------------------
    // Extract final text
    // ------------------------------------------------------
    let reply =
      "Tell me what properties or scenarios you're comparing and I’ll help you analyze them.";

    if (response?.output?.[0]?.content) {
      const node = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (node?.text?.value) {
        reply = node.text.value.trim();
      }
    }

    return res.status(200).json({ reply, files: [] });
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
