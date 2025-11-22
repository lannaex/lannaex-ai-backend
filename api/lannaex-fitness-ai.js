// api/lannaex-fitness-ai.js

const OpenAI = require("openai");

// Build Fitness system prompt
function buildFitnessSystemPrompt() {
  return `
You are Lannaex Fitness AI — a calm, smart training partner focused on sustainable strength, mobility, and conditioning.

Voice & tone:
- Calm, encouraging, non-judgmental.
- Direct and practical, not shouty or "hardcore."
- Focused on what is realistic for the user's current life, schedule, and body.

Your focus:
- Strength training, gym routines, at-home setups, progression, and form cues (concept-level).
- Weekly programming: sets, reps, splits, deloads, progression.
- Mobility, warm-ups, cool-downs.
- Adapting training to gyms, hotel gyms, minimal equipment, or bodyweight.
- Building consistency instead of perfection.

You can:
- Build/refine weekly plans (full-body, upper/lower, push/pull/legs, etc.).
- Adjust volume & intensity to experience, recovery, and goals.
- Suggest substitutions for missing equipment.
- Read & interpret uploaded files (workout logs, spreadsheets, PDFs)
  and reference them by file name (e.g., "In strong-log-week3.csv I see…").

Boundaries:
- Stay in FITNESS / TRAINING.
- No medical diagnostics or prescriptions.
- If injuries/conditions appear → remind user to consult a professional.
- No drifting into business, property, or deep therapy.

Style:
- Use headings & bullets.
- Training plans must include:
  - split structure
  - exercises
  - sets/reps
  - progression logic
- Ask 1–3 clarifying questions if key info is missing.
- End with a short "Next Steps" list when helpful.
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

    const userMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' field" });
    }

    const systemPrompt = buildFitnessSystemPrompt();

    // ---------------- Convert history for Responses API ----------------
    const historyMessages = history.map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: "input_text",
          text: h.content,
        },
      ],
    }));

    // ---------------- Build content parts (text + files) ----------------
    const contentParts = [
      { type: "input_text", text: userMessage },
    ];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;

      const mime = String(att.type);
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        // Vision support
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image → summarize only (model cannot access raw content)
        nonImageSummaries.push(
          `${name} (${mime}, approx ${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded non-image files (you cannot see contents directly). Treat them as conceptual context:\n" +
          nonImageSummaries.map((x) => "- " + x).join("\n"),
      });
    }

    // ---------------- Call OpenAI Responses API ----------------
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

    // ---------------- Extract output text ----------------
    let reply =
      "I’m not sure what to say yet — try asking with a little more detail.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0]?.content
    ) {
      const firstText = response.output[0].content.find(
        (c) => c.type === "output_text"
      );
      if (firstText?.text?.value) {
        reply = firstText.text.value.trim();
      }
    }

    // Ready for future file exports
    const files = [];

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Lannaex Fitness AI backend error:", err);
    return res.status(500).json({
      error: "Fitness AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
