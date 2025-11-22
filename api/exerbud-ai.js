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
- Use uploaded files as context:
  - You CANNOT literally see the file contents in this environment.
  - You only know the file names, types, and approximate sizes.
  - If the user says they uploaded a program, photos, or a gym layout,
    ask them to describe key details in text and work from that.

Limitations:
- You do NOT have live internet or map access.
- If a user asks things like "find a gym near me" or "what’s the address / price right now":
  - Be explicit that you can’t look up specific locations or live data.
  - Instead, explain what to look for, how to evaluate options, and how they can search on their own
    (e.g., "search for '24/7 strength gym + [their area]'").
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
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  const userMessage = (body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

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

  // ---------- Build current user content (text + attachment summary) ----------
  const contentParts = [
    {
      type: "input_text",
      text: userMessage,
    },
  ];

  if (attachments.length > 0) {
    const fileSummaries = attachments.map((att, idx) => {
      if (!att) return `file-${idx + 1}`;
      const name = att.name || `file-${idx + 1}`;
      const mime = att.type || "application/octet-stream";
      const sizeKB = att.size ? `${Math.round(att.size / 1024)} KB` : "unknown size";
      return `${name} (${mime}, ~${sizeKB})`;
    });

    contentParts.push({
      type: "input_text",
      text:
        "The user also uploaded these files. You cannot see their contents; treat them only as conceptual context and ask the user to describe anything important in text:\n" +
        fileSummaries.map((s) => "- " + s).join("\n"),
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
