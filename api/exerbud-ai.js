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
  - In this environment you CANNOT directly see file contents.
  - You only know file names, types, and approximate sizes.
  - If the user says they uploaded a program, photos, or gym layout,
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

  try {
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
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    const systemPrompt = buildExerbudSystemPrompt();

    // ---------- Convert history to chat.completions format ----------
    const historyMessages = history
      .filter((h) => h && typeof h.content === "string")
      .map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: h.content,
      }));

    // ---------- Build current user content (text + attachment summary) ----------
    let userContent = userMessage;

    if (attachments.length > 0) {
      const fileSummaries = attachments.map((att, idx) => {
        if (!att) return `file-${idx + 1}`;
        const name = att.name || `file-${idx + 1}`;
        const mime = att.type || "application/octet-stream";
        const sizeKB = att.size ? `${Math.round(att.size / 1024)} KB` : "unknown size";
        return `${name} (${mime}, ~${sizeKB})`;
      });

      userContent +=
        "\n\n[Note to Exerbud: The user has uploaded files in the UI. " +
        "You cannot see their contents here — you only know names/types/sizes. " +
        "If needed, ask the user to describe the important parts in text. " +
        "Uploaded files:\n" +
        fileSummaries.map((s) => "- " + s).join("\n") +
        "\n]";
    }

    // ---------- Call Chat Completions API ----------
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userContent },
      ],
      max_tokens: 900,
      temperature: 0.7,
    });

    let reply =
      "I’m not sure what to say yet — try asking again with a bit more detail about your training.";

    if (
      completion &&
      Array.isArray(completion.choices) &&
      completion.choices[0] &&
      completion.choices[0].message &&
      typeof completion.choices[0].message.content === "string"
    ) {
      reply = completion.choices[0].message.content.trim();
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);

    // Return 200 so the frontend doesn't show its generic error
    const safeMessage =
      "I hit an internal backend error and couldn't complete this request. " +
      (err && err.message ? `Details: ${err.message}` : "");

    return res.status(200).json({
      reply: safeMessage,
    });
  }
};
