// api/lannaex-fitness-ai.js

const OpenAI = require("openai");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

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
  and reference them by file name.

Boundaries:
- Stay in FITNESS / TRAINING.
- No medical diagnostics or prescriptions.
- If injuries/conditions appear → remind user to consult a professional.
- No drifting into business, property, or deep therapy.

Style:
- Use headings & bullets.
- Plans must include split, exercises, sets/reps, and progression logic.
- Ask 1–3 clarifying questions if needed.
- End with “Next Steps” when helpful.
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

    const rawMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!rawMessage) {
      return res.status(400).json({ error: "Missing 'message' field" });
    }

    // -------------------------
    // INTERNET SEARCH
    // -------------------------
    let userMessage = rawMessage;

    if (shouldUseSearch(rawMessage)) {
      try {
        const searchResults = await webSearch(rawMessage);
        if (searchResults) {
          userMessage =
            rawMessage +
            "\n\n[Live web search results for context — use only if helpful:\n" +
            searchResults +
            "\n]";
        }
      } catch (err) {
        console.error("Fitness AI web search error:", err);
      }
    }

    const systemPrompt = buildFitnessSystemPrompt();

    // ---------------- Convert history ----------------
    const historyMessages = history.map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: h.content }],
    }));

    // ---------------- Build content parts ----------------
    const contentParts = [{ type: "input_text", text: userMessage }];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;

      const mime = att.type;
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        contentParts.push({
          type: "input_image",
          image_url: { url: `data:${mime};base64,${att.data}` },
        });
      } else {
        nonImageSummaries.push(
          `${name} (${mime}, approx ${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user uploaded non-image files (contents not visible). Treat them conceptually:\n" +
          nonImageSummaries.map((x) => "- " + x).join("\n"),
      });
    }

    // ---------------- Call OpenAI Responses API ----------------
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        ...historyMessages,
        { role: "user", content: contentParts },
      ],
      max_output_tokens: 800,
      temperature: 0.7,
    });

    // ---------------- Extract output ----------------
    let reply =
      "I’m not sure what to say yet — try asking with a little more detail.";

    if (response?.output?.[0]?.content) {
      const out = response.output[0].content.find((c) => c.type === "output_text");
      if (out?.text?.value) reply = out.text.value.trim();
    }

    return res.status(200).json({ reply, files: [] });
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
