// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

Limitations:
- You do NOT have live internet or map access.
- If a user asks things like "find a gym near me" or "what’s the address / price right now":
  - Be explicit that you can’t look up specific locations or live data.
  - Instead, explain what to look for, how to evaluate options, and how they can search on their own
    (e.g., “search for ‘24/7 strength gym + [their area]’”).
- You do NOT diagnose injuries or medical issues and never prescribe drugs.
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

  // ---------- Parse body ----------
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ reply: "Invalid JSON in request body", error: "Invalid JSON" });
    }
  }

  if (!body || typeof body !== "object") {
    return res.status(400).json({
      reply: "Body must be a JSON object.",
      error: "Body must be a JSON object",
    });
  }

  const userMessage = (body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!userMessage) {
    return res.status(400).json({
      reply: "Missing 'message' in body.",
      error: "Missing 'message' in body",
    });
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
        "The user also uploaded these non-image files. " +
        "You cannot read their contents; treat them only as conceptual context:\n" +
        nonImageSummaries.map((s) => "- " + s).join("\n"),
    });
  }

  try {
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
      max_output_tokens: 900,
      temperature: 0.7,
    });

    // ---------- Extract reply ----------
    let reply =
      "I’m not sure what to say yet — try asking again with a bit more detail about your training.";

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

    return res.status(200).json({ reply });
  } catch (err) {
    // ---------- DEBUG PATH: show real error in UI + logs ----------
    console.error("Exerbud AI backend error:", err);

    // Try to unwrap common OpenAI error shapes
    const status = err.status || err.code;
    const message =
      (err?.error && err.error.message) ||
      err?.message ||
      String(err);

    const debugInfo = `Exerbud backend error (status: ${status ?? "unknown"}): ${message}`;

    // TEMPORARY: send back as reply so you see it in the chat bubble
    return res.status(200).json({
      reply: debugInfo,
      error: message,
      status,
    });
  }
};
