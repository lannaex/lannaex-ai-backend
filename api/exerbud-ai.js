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
  - When the user uploads images, describe what you see and use it to tailor advice
    (e.g., equipment available, form cues at a concept level, general physique trends).
- Use uploaded non-image files only conceptually (you do NOT see contents).

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
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = buildExerbudSystemPrompt();

  // ---------- Build messages for chat.completions ----------
  const messages = [];

  // System
  messages.push({
    role: "system",
    content: systemPrompt,
  });

  // History (plain text only)
  history
    .filter((h) => h && typeof h.content === "string")
    .forEach((h) => {
      messages.push({
        role: h.role === "assistant" ? "assistant" : "user",
        content: h.content,
      });
    });

  // Current user message: text + image parts
  const userContentParts = [];

  // Text part
  userContentParts.push({
    type: "text",
    text: userMessage,
  });

  // Image parts (vision)
  attachments.forEach((att, index) => {
    if (!att || !att.data || !att.type) return;

    const mime = String(att.type || "");
    if (!mime.startsWith("image/")) {
      // Non-image files are ignored for now (no crash)
      return;
    }

    userContentParts.push({
      type: "image_url",
      image_url: {
        // Frontend is already sending base64 data; we wrap it as a data URL
        url: `data:${mime};base64,${att.data}`,
      },
    });
  });

  messages.push({
    role: "user",
    content: userContentParts,
  });

  try {
    // ---------- Call Chat Completions API ----------
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.7,
      max_tokens: 900,
    });

    let reply =
      "I’m not sure what to say yet — try asking again with a bit more detail about your training.";

    if (
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message
    ) {
      const content = completion.choices[0].message.content;

      if (Array.isArray(content)) {
        // If API ever returns multi-part content, join the text pieces
        reply = content
          .filter((part) => part.type === "text" && part.text)
          .map((part) => part.text)
          .join("\n\n")
          .trim();
      } else if (typeof content === "string") {
        reply = content.trim();
      }
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);
    return res.status(500).json({
      error: "Exerbud backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
