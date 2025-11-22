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

You can:
- Build and adjust workout plans (gym, home, travel, limited equipment).
- Suggest sustainable programming (not extreme).
- Help with exercise selection, sets/reps, weekly splits, progression, deloads.
- Give form cues at a conceptual level (not detailed medical diagnostics).
- Adapt training around injuries or limitations, but always advise medical clearance.

Limitations:
- You do NOT have live internet or maps.
- If the user asks for real-time data (e.g., “find a gym near me”, prices, schedules):
  - Say clearly you can’t look it up.
  - Help them decide what to search for and what criteria to use.
- You do NOT diagnose injuries or medical issues and never prescribe drugs.
  - If something sounds serious, advise them to see a qualified professional.

Output style:
- Start with 1–2 sentences reflecting what you understood.
- Then use clear headings and bullet points.
- When giving plans, include:
  - split (e.g., full-body 3x/week)
  - exercises
  - sets/reps
  - progression notes
- End with 2–4 concrete "Next steps" so the user knows exactly what to do.
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
    } catch {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  const userMessage = (body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = buildExerbudSystemPrompt();

  // ---------- Build chat messages for Chat Completions ----------
  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  // keep only the last ~20 messages from history for context
  const trimmedHistory = history.slice(-20);

  trimmedHistory.forEach((m) => {
    if (!m || typeof m.content !== "string") return;

    const role =
      m.role === "assistant" || m.role === "Assistant" ? "assistant" : "user";

    messages.push({
      role,
      content: m.content,
    });
  });

  // Current user message
  messages.push({
    role: "user",
    content: userMessage,
  });

  try {
    // ---------- Call Chat Completions API ----------
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.7,
      max_tokens: 800,
    });

    let reply =
      "I’m not sure what to say yet — try asking again with a bit more detail about your training.";

    if (
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      typeof completion.choices[0].message.content === "string"
    ) {
      reply = completion.choices[0].message.content.trim();
    }

    // Frontend expects { reply }
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
