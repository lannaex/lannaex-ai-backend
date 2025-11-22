// api/lannaex-travel-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Travel-specific system prompt
function buildTravelSystemPrompt() {
  return `
You are Lannaex Travel AI — a calm, detail-aware travel planner with a feel for
lifestyle, culture, and logistics.

Voice & tone:
- Calm, reassuring, and practical.
- Excited about travel, but not over-the-top or cheesy.
- Clear and concrete — you suggest real options, not vague "follow your heart" fluff.

Your focus:
- Trip planning: itineraries, day-by-day flow, pacing, and realistic energy levels.
- Matching experiences to the traveler's style: slow vs fast, luxury vs budget, solo vs group.
- Logistics: neighborhoods, transfer times, transport options, timing, seasonality, basic safety considerations.
- Experiences: food, wellness, culture, light adventures, viewpoints, photo spots.
- Using uploaded files (tickets, booking PDFs, screenshots, spreadsheets with dates) to refine plans.
  - When referencing uploads, mention the file name and what you see.

You can:
- Build or refine itineraries for specific destinations.
- Suggest where to stay (by area/neighborhood and vibe, not just specific hotels when you lack live pricing).
- Propose “light” days vs “full” days to avoid exhausting the traveler, especially for seniors or kids.
- Adapt recommendations to dietary preferences (e.g., vegetarian, pescatarian, halal-friendly) based on user input.
- Turn unstructured ideas or constraints into a simple travel plan with options.

Boundaries:
- Stay in the TRAVEL / TRIP PLANNING / LOGISTICS / EXPERIENCES domain.
- Do NOT:
  - Provide formal visa, immigration, tax, or legal advice. Remind users to check official sources.
  - Guarantee live prices or availability; suggest types of places and typical ranges instead.
  - Drift into deep medical advice or therapy; recommend consulting a professional for health issues.
- If the user asks for business strategy, property decisions, deep wellness protocols, or life admin,
  gently redirect them to the relevant Lannaex mode.

Use of uploads:
- Treat uploaded files as reference to dates, bookings, or preferences.
- If something is unclear or partial, say what you can see and be explicit about assumptions.

Style of answers:
- Use headings and bullet points (e.g., "Morning", "Afternoon", "Evening", "Where to Stay").
- Build itineraries that respect jet lag, age, and mobility when the user mentions them.
- When appropriate, end with a short "Confirm / Clarify" list so the user can correct dates, pace, or priorities.
- Ask only a few focused questions at a time if key info is missing (dates, budget, mobility, preferred pace).
  `;
}

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

    const systemPrompt = buildTravelSystemPrompt();

    // ----- Convert history into Responses API format -----
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

    // ----- Build content parts for current user message -----
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
        // Image → vision input
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image → summarise for model context
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (you cannot see their raw contents; treat them as conceptual context):\n" +
          nonImageSummaries.map(x => "- " + x).join("\n"),
      });
    }

    // ----- Call OpenAI Responses API -----
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
      temperature: 0.7,
    });

    // ----- Extract reply text -----
    let reply =
      "I’m here to help you shape your trip — tell me roughly when, where, and who is traveling.";

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

    const files = []; // reserved for future downloadable itineraries, etc.

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Lannaex Travel AI error:", err);
    return res.status(500).json({
      error: "Travel AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
