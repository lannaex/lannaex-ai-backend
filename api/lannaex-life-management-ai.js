// api/lannaex-life-management-ai.js

const OpenAI = require("openai");
const { webSearch, shouldUseSearch } = require("./utils/web-search");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Life Management–specific system prompt
function buildLifeManagementSystemPrompt() {
  return `
You are Lannaex Life Management AI — a calm, organized, behind-the-scenes helper
focused on simplifying the user's day-to-day life.

Voice & tone:
- Calm, clear, non-judgmental.
- Practical and structured — you reduce overwhelm by organizing.
- Encouraging but not cheesy or over-motivational.

Your focus:
- Personal logistics: schedules, routines, to-do lists, and planning.
- Birthdays, holidays, gifting ideas, and recurring special dates.
- Organizing information across different life areas (family, travel, errands, admin).
- Breaking down big messy tasks into small, realistic steps.
- Helping the user decide what can be automated, delegated, or simplified.

You can:
- Turn vague brain-dumps into structured to-do lists, grouped by priority or theme.
- Help plan recurring routines (weekly, monthly, quarterly) for life admin and self-care.
- Create checklists for events, trips, or family logistics.
- Suggest ways to track important dates and preferences (e.g., birthdays, gift ideas, notes).
- Use uploaded files (spreadsheets, PDFs, lists, screenshots) to extract and organize information.
  - When referencing uploads, mention the file name and what you see (e.g., "In birthdays-2025.xlsx...").

Boundaries:
- Stay in the LIFE MANAGEMENT / ORGANIZATION / PERSONAL LOGISTICS domain.
- Do NOT drift into deep business strategy, real estate deals, therapy, or medical advice.
  - If the user asks for those, gently redirect and suggest which Lannaex mode might help instead.
- You can talk about general wellbeing routines (sleep, planning, breaks), but not diagnose or treat conditions.

Style of answers:
- Use headings and bullet points to keep things easy to scan.
- For complex situations, summarize what you understand, then propose a simple structure.
- When appropriate, end with a short "Next 3 steps" list so the user knows exactly what to do.
- If key information is missing (e.g., how much time they realistically have, how many people are involved),
  ask 1–3 focused questions rather than a long list.
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
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in request body" });
      }
    }

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Body must be a JSON object" });
    }

    const rawMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!rawMessage) {
      return res.status(400).json({ error: "Missing 'message' in body" });
    }

    // ------------- Internet search enrichment -------------
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
        console.error("Life Management AI web search error:", err);
        // If search fails, we just fall back to the raw message
      }
    }

    const systemPrompt = buildLifeManagementSystemPrompt();

    // -------- Convert history to Responses API format --------
    const historyMessages = history
      .filter(h => h && typeof h.content === "string")
      .map(h => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: "input_text",
            text: h.content,
          },
        ],
      }));

    // -------- Build content parts for current user message --------
    const contentParts = [
      {
        type: "input_text",
        text: userMessage,
      },
    ];

    const nonImageSummaries = [];

    attachments.forEach((att, idx) => {
      if (!att || !att.data || !att.type) return;

      const mime = String(att.type);
      const name = att.name || `file-${idx + 1}`;

      if (mime.startsWith("image/")) {
        // Vision: inline image as data URL
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // Non-image files: summarize for the model
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (you cannot see their raw content, but you can reference them conceptually):\n" +
          nonImageSummaries.map(x => "- " + x).join("\n"),
      });
    }

    // -------- Call OpenAI Responses API --------
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

    // -------- Extract reply text --------
    let reply =
      "I’m here to help you organize things — try sharing a bit more detail about what feels most cluttered.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const firstText = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (
        firstText &&
        firstText.text &&
        typeof firstText.text.value === "string"
      ) {
        reply = firstText.text.value.trim();
      }
    }

    const files = []; // placeholder for future backend-generated files

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Lannaex Life Management AI error:", err);
    return res.status(500).json({
      error: "Life Management AI backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? err.message || String(err)
          : undefined,
    });
  }
};
