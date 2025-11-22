// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // MUST be a valid Project API key
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
function buildExerbudSystemPrompt() {
  return `
You are Exerbud — a realistic, no-bullshit strength and conditioning coach.

Tone:
- Direct but kind.
- Grounded and practical, no bro-science.
- Respect people’s actual lives, schedules, stress, and recovery.

Capabilities:
- Build and adjust workout plans (gym, home, travel, limited equipment).
- Suggest sustainable programming (not extreme).
- Help with exercise selection, sets/reps, weekly splits, progression, deloads.
- Interpret photos of gym equipment, physique progress, or program screenshots.
- Use uploaded files as context:
  - Images → describe what you see and use it to tailor advice.
  - Non-image files → you only know their name/type/size; you cannot read the content.

Web search:
- You have access to a web_search_preview tool for up-to-date information
  (e.g., current events, trends, recent studies, or typical offerings in a city).
- Use web_search_preview only when RECENT or LOCATION-SPECIFIC information is needed.
- You still CANNOT see the user's exact GPS location; you only use the location text they give you.

Limitations:
- Do NOT give medical diagnoses or prescribe drugs.
- If something sounds serious, advise them to see a qualified professional.

Output style:
- Start with 1–2 sentences reflecting what you understood.
- Then give structured guidance with headings and bullet points.
- End with 2–4 clear "Next steps" so the user knows exactly what to do.
`.trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  // Basic CORS
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
    // ---------- Parse body ----------
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in request body" });
      }
    }

    if (!body || typeof body !== "object") {
      return res
        .status(400)
        .json({ error: "Request body must be a JSON object" });
    }

    const userMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments)
      ? body.attachments
      : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    const systemPrompt = buildExerbudSystemPrompt();

    // ---------- Convert history to Responses API format ----------
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

    // ---------- Build current user content (text + attachments) ----------
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
        // Image → vision input
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image → summarise only (model cannot see contents)
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files. " +
          "You cannot read their contents; treat them only as conceptual context:\n" +
          nonImageSummaries.map((s) => "- " + s).join("\n"),
      });
    }

    // ---------- Call OpenAI Responses API (with web search) ----------
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }], // REAL internet search
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
      // if you DON'T want logs stored in the OpenAI dashboard, set:
      // store: false,
    });

    // You can use the convenience field when available:
    let reply = response.output_text;
    if (!reply) {
      // Fallback to manual extraction
      if (
        response &&
        Array.isArray(response.output) &&
        response.output[0] &&
        Array.isArray(response.output[0].content)
      ) {
        const textNode = response.output[0].content.find(
          (c) => c.type === "output_text"
        );
        if (
          textNode &&
          textNode.text &&
          typeof textNode.text.value === "string"
        ) {
          reply = textNode.text.value.trim();
        }
      }
    }

    if (!reply) {
      reply =
        "I had trouble generating a reply. Try rephrasing your question or adding a bit more detail.";
    }

    return res.status(200).json({ reply });
  } catch (err) {
    // This log is what you'll see in Vercel → Functions → Logs
    console.error("Exerbud AI backend error:", {
      message: err.message,
      stack: err.stack,
      status: err.status,
      code: err.code,
      response: err.response?.data,
    });

    return res.status(500).json({
      error: "Exerbud backend failed.",
      // Only expose internals if you're in dev:
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
