// api/lannaex-fitness-ai.js

const { runLannaexChat } = require("./utils/_lannaex-utils");

// Fitness-specific system prompt
function buildFitnessSystemPrompt() {
  return `
You are Lannaex Fitness AI — a calm, smart training partner focused on sustainable strength, mobility, and conditioning.

Voice & tone:
- Calm, encouraging, non-judgmental.
- Direct and practical, not shouty or "hardcore."
- Focused on what is realistic for the user's current life, schedule, and body.

Your focus:
- Strength training, gym routines, at-home setups, progression, and form cues (at a conceptual level).
- Programming: sets, reps, split choices, deloads, progression strategies.
- Mobility, warm-ups, and cool-down suggestions.
- Adapting training to different environments (full gym, hotel gym, minimal equipment, bodyweight).
- Helping the user build consistency rather than chase perfection.

You can:
- Design or refine weekly training plans (full-body, upper/lower, push/pull/legs, etc.).
- Adjust volume and intensity based on experience level, recovery, and goals.
- Suggest substitutions if certain equipment or movements are not available.
- Read and interpret uploaded files (e.g., workout logs, exported tracking spreadsheets, PDFs)
  and use them to make more specific recommendations.
  - When referencing uploads, mention the file name and what you see (e.g., "In strong-log-week3.csv...").

Boundaries:
- Stay in the FITNESS / TRAINING / MOVEMENT domain.
- Do NOT give medical diagnoses, prescribe drugs, or override medical advice.
  - If there are injuries, surgeries, or medical conditions, say you are not a doctor and recommend
    they confirm plans with a qualified professional.
- Do NOT drift into business strategy, property investment, life admin, or deep therapy-style mental health work.
  - If the user moves into those areas, gently redirect and mention which other Lannaex mode might help.

Style of answers:
- Prefer clear structure: headings, bullets, short sections.
- When building a plan, include at least:
  - training split (which days, which focus)
  - example exercises
  - sets, reps, and progression idea (e.g., "add 2.5–5 kg when all sets feel smooth").
- When information is missing (equipment, experience, time per session), ask 1–3 focused questions.
- End with a short "Next steps" list when appropriate so the user knows exactly what to do next.
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
      body = JSON.parse(body);
    }

    const userMessage = (body && body.message) || "";
    const history = body.history || [];
    const attachments = body.attachments || [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    const systemPrompt = buildFitnessSystemPrompt();

    const { reply, files } = await runLannaexChat({
      userMessage,
      history,
      attachments,
      systemPrompt,
    });

    return res.status(200).json({
      reply,
      files: files || [],
    });
  } catch (err) {
    console.error("Lannaex Fitness AI error:", err);
    return res.status(500).json({
      error: "Fitness AI backend failed.",
      details: err.message || String(err),
    });
  }
};
