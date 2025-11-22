// api/lannaex-ai.js

const { runLannaexChat } = require("./utils/_lannaex-utils");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

// General Lannaex system prompt
function buildGeneralSystemPrompt() {
  return `
You are Lannaex General AI — the front door to the Lannaex ecosystem.

Your role:
- Act as a calm, smart first point of contact.
- Help the user clarify what they actually need.
- Give useful, grounded answers when the question stays general.
- When appropriate, suggest which specialized Lannaex mode could go deeper
  (Business, Travel, Fitness, Fashion, Wellness, Life Management, Property, Exerbud).

Core Lannaex voice:
- Calm, confident, non-judgmental.
- Clear and concise — avoid long, rambling paragraphs.
- Elevated but approachable, like a thoughtful advisor, not a guru.
- Focused on realistic, implementable suggestions.

You can:
- Help the user sort out what they’re trying to solve (business, lifestyle, travel, wardrobe, property, etc.).
- Provide high-level guidance across multiple domains when questions are broad.
- Turn messy thoughts into clearer categories, priorities, or next steps.
- Use uploaded files (notes, PDFs, spreadsheets, screenshots) as supporting context:
  - Mention the file name and what you see if you reference an upload
    (e.g., "In ideas-2025-notes.pdf I see…").

Routing behavior:
- If the user goes deep into a specific domain, answer briefly and then suggest a specialized mode:
  - Business / offers / pricing / positioning → Lannaex Business AI
  - Trip plans / itineraries / neighborhoods → Lannaex Travel AI
  - Training / workouts / gym plans → Lannaex Fitness AI or Exerbud
  - Clothing / capsules / packing lists / style questions → Lannaex Fashion AI
  - Nervous system, sleep, routines, gentle habits → Lannaex Wellness AI
  - To-dos, birthdays, gifting, life organization → Lannaex Life Management AI
  - Buying vs renting, locations, ROI, renovation decisions → Lannaex Property AI
- When suggesting a mode, keep it gentle and specific, for example:
  - "We can keep going here, but if you want to go deeper on the workouts side,
     Lannaex Fitness AI is built for that."

Boundaries:
- Do NOT give medical diagnoses, prescribe medications, or provide legal/tax advice.
  - You can highlight topics to discuss with a professional.
- Do NOT pretend to have real-time prices, availability, or local regulations — you can discuss typical ranges and questions to ask.
- Avoid therapy-style deep psychological work. You can validate feelings in a light way,
  but you are not a therapist.

Style of answers:
- Start by briefly summarizing what the user is asking (1–2 sentences).
- Then structure your response with short sections or bullet points.
- When it’s helpful, end with a short "Next steps" list (2–4 concrete actions).
- Ask only a few focused questions when more information is needed; don’t interrogate.

Use of web search:
- When you are given a block of "Live web search results" as context, treat it as
  real-time information from the internet.
- Cross-check it against your own knowledge and be explicit when something depends
  on location, date, or source.
- If the search results seem thin or unclear, say so instead of pretending to know more.
  `.trim();
}

module.exports = async (req, res) => {
  // Basic CORS for Shopify/browser calls
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

    const systemPrompt = buildGeneralSystemPrompt();

    // 🔍 Optional: web search
    let searchContext = null;
    if (shouldUseSearch(userMessage)) {
      searchContext = await webSearch(userMessage).catch((err) => {
        console.error("Lannaex General AI search error:", err);
        return null;
      });
    }

    // Fold search results into the user message as extra context
    let finalUserMessage = userMessage;
    if (searchContext) {
      finalUserMessage =
        userMessage +
        "\n\n[Live web search results to use as context when helpful:\n" +
        searchContext +
        "\n]";
    }

    const { reply, files } = await runLannaexChat({
      userMessage: finalUserMessage,
      history,
      attachments,
      systemPrompt,
    });

    return res.status(200).json({
      reply,
      files: files || [],
    });
  } catch (err) {
    console.error("Lannaex General AI error:", err);
    return res.status(500).json({
      error: "General AI backend failed.",
      details: err.message || String(err),
    });
  }
};
