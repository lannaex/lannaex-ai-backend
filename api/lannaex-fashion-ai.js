// api/lannaex-fashion-ai.js

const OpenAI = require("openai");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

// Build Fashion prompt directly here (matches your original)
function buildFashionSystemPrompt() {
  return `
You are Lannaex Fashion AI, a calm, elevated style guide within the Lannaex ecosystem.

Voice & tone:
- Calm, confident, and non-judgmental.
- Clear, concise, minimal — no fluff or over-the-top hype.
- Feels like a thoughtful stylist who understands real life, not a runway critic.

Your focus:
- Personal style, outfits, capsules, packing lists, and wardrobe planning.
- Adapting looks to context: travel, climate, culture, body type, comfort level, and lifestyle.
- Helping the user express who they are with ease, not chase every trend.

You can:
- Suggest complete outfits for specific occasions, trips, or seasons.
- Build capsule wardrobes and packing lists (by item type, not brand-dependent).
- Recommend color palettes and silhouettes based on the user’s preferences or body comments.
- Refine what the user already owns instead of always pushing new purchases.
- Use uploaded photos or documents (if provided) as reference for vibe, colors, or items.
  - When referencing uploads, mention the file name and what you observe.

Boundaries:
- Stay in the FASHION / STYLE domain.
- Do NOT drift into business, property, wellness protocols, or life admin.
- Avoid medical or mental-health advice.
- Keep suggestions realistic and category-based rather than luxury-label specific.

Style:
- Prefer bullet points, short sections, and clear headings.
- End with a short "Try this next" section when appropriate.
- Ask only 1–3 clarifying questions when needed.
  `;
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // Basic CORS
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
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Body must be an object" });
    }

    const rawMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!rawMessage) {
      return res.status(400).json({ error: "Missing 'message' field" });
    }

    const systemPrompt = buildFashionSystemPrompt();

    // ---------- Optional Internet Search ----------
    let userMessage = rawMessage;

    if (shouldUseSearch(rawMessage)) {
      try {
        const searchContext = await webSearch(rawMessage);
        if (searchContext) {
          userMessage =
            rawMessage +
            "\n\n[Live web search results for additional context (use only if helpful):\n" +
            searchContext +
            "\n]";
        }
      } catch (err) {
        console.error("Lannaex Fashion AI web search error:", err);
        // Fail-soft: continue without search context
      }
    }

    // ---------- Convert history for Responses API ----------
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

    // ---------- Build content parts (text + files) ----------
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
        // Vision attachment
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image → describe to model
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (you cannot see their raw content, but you may reference them conceptually):\n" +
          nonImageSummaries.map(x => "- " + x).join("\n"),
      });
    }

    // ---------- Call OpenAI Responses API ----------
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
      temperature: 0.7,
    });

    // ---------- Extract reply text ----------
    let reply = "I’m not sure what to say yet — try asking with a bit more detail.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0]?.content
    ) {
      const firstText = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (firstText?.text?.value) {
        reply = firstText.text.value.trim();
      }
    }

    // No backend-generated files yet → return empty array
    const files = [];

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Lannaex Fashion AI backend error:", err);
    return res.status(500).json({
      error: "Fashion AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
