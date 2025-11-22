// api/lannaex-wellness-ai.js

const OpenAI = require("openai");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Wellness-specific system prompt
function buildWellnessSystemPrompt() {
  return `
You are Lannaex Wellness AI — a calm, grounded guide focused on practical,
sustainable wellbeing.

Voice & tone:
- Calm, kind, non-judgmental.
- Grounded and realistic — you avoid extremes and "all-or-nothing" thinking.
- Clear and concise; you remove overwhelm instead of adding more rules.

Your focus:
- Day-to-day wellbeing: sleep routines, stress management, nervous system support,
  gentle movement, simple nutrition habits, and realistic self-care.
- Building small, sustainable habits that fit into real life (not perfect protocols).
- Helping the user prioritize: what matters now vs. what can wait.
- Using uploaded files (logs, trackers, PDFs, notes, plans) to understand patterns.
  - When referencing uploads, mention the file name and what you see.

You can:
- Suggest simple routines (morning, evening, pre-bed, pre-work).
- Offer nervous system support in a non-medical way.
- Help structure 2-week experiments and habit tests.
- Turn scattered notes into 2–3 focused priorities.

Boundaries:
- Stay in the WELLNESS / LIFESTYLE / HABIT domain.
- Do NOT diagnose, prescribe, or give medical treatment plans.
- If serious symptoms appear → suggest talking to a qualified professional.
- Do not drift into business, property, or deep life admin.

Style:
- Headings + bullet points.
- Doable next steps.
- Ask 1–3 clarifying questions if needed.
  `;
}

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

    // Shopify sometimes sends as string
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
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

    // -------------------------------
    // INTERNET SEARCH INJECTION
    // -------------------------------
    let userMessage = rawMessage;

    if (shouldUseSearch(rawMessage)) {
      try {
        const results = await webSearch(rawMessage);
        if (results) {
          userMessage =
            rawMessage +
            "\n\n[Live web search results for context — use only if helpful:\n" +
            results +
            "\n]";
        }
      } catch (err) {
        console.error("Wellness AI web search error:", err);
      }
    }

    const systemPrompt = buildWellnessSystemPrompt();

    // -------- Convert prior history --------
    const historyMessages = history
      .filter(m => m && typeof m.content === "string")
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: "input_text",
            text: m.content,
          },
        ],
      }));

    // -------- Build content for new message --------
    const contentParts = [{ type: "input_text", text: userMessage }];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;
      const mime = String(att.type);
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        contentParts.push({
          type: "input_image",
          image_url: { url: `data:${mime};base64,${att.data}` },
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
          "The user also uploaded these non-image files (contents not visible; reference conceptually):\n" +
          nonImageSummaries.map(x => "- " + x).join("\n"),
      });
    }

    // -------- Call OpenAI Responses API --------
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 900,
      temperature: 0.7,
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
    });

    // Extract reply
    let reply =
      "I’m here to help you feel more grounded — tell me what feels off right now.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0]?.content
    ) {
      const node = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (node?.text?.value) {
        reply = node.text.value.trim();
      }
    }

    return res.status(200).json({ reply, files: [] });
  } catch (err) {
    console.error("Lannaex Wellness AI error:", err);
    return res.status(500).json({
      error: "Wellness AI backend failed.",
      details:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
