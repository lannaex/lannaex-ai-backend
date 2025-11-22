// api/lannaex-ai.js
// Unified multimodal backend (matches Exerbud capabilities)

const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------------
//  SYSTEM PROMPT
// -------------------------
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

Boundaries:
- Do NOT give medical diagnoses, prescribe medications, or provide legal/tax advice.
- Do NOT pretend to have real-time prices, availability, or local regulations.
- Avoid therapy-style deep psychological work.

Answer format:
- Begin with a short summary (1–2 sentences).
- Use short sections or bullet points.
- End with a "Next steps" list when helpful.
- Ask only 1–3 concise clarifying questions if needed.
  `;
}

// -------------------------
//  API HANDLER
// -------------------------
module.exports = async (req, res) => {
  // CORS for Shopify
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // -------------------------
    // Body parsing
    // -------------------------
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    const userMessage = body.message;
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!userMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    const systemPrompt = buildGeneralSystemPrompt();

    // -------------------------
    // Build messages array
    // -------------------------
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }))
    ];

    // Build user message with attachments
    const userContent = [{ type: "text", text: userMessage }];

    // Add image/file uploads
    for (const file of attachments) {
      if (!file.data || !file.type) continue;
      userContent.push({
        type: "input_file",
        mime_type: file.type,
        data: file.data, // base64 string
      });
    }

    messages.push({ role: "user", content: userContent });

    // -------------------------
    // OpenAI multimodal call
    // -------------------------
    const response = await client.responses.create({
      model: "gpt-4.1", // full multimodal capability
      messages,
      max_output_tokens: 800,
      temperature: 0.7,
    });

    // Extract reply
    let replyText = "";
    if (response.output && Array.isArray(response.output[0].content)) {
      const textPart = response.output[0].content.find(x => x.type === "output_text");
      replyText = textPart?.text || "";
    }

    // Future extension: model can output files
    const fileOutputs = [];

    // -------------------------
    // Return standard shape
    // -------------------------
    return res.status(200).json({
      reply: replyText || "I’m here — tell me more and I’ll help you clarify.",
      files: fileOutputs,
    });

  } catch (err) {
    console.error("Lannaex General AI error:", err);
    return res.status(500).json({
      error: "General AI backend failed.",
      details: err.message || String(err),
    });
  }
};
