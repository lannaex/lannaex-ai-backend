// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }

  const userMessage = body.message || "";
  const history = Array.isArray(body.history) ? body.history : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  // -------------------------------
  // 24-HOUR AUTO RESET
  // -------------------------------
  let trimmedHistory = [];
  const now = Date.now();

  history.forEach(h => {
    if (h.timestamp && now - h.timestamp < 24 * 60 * 60 * 1000) {
      trimmedHistory.push(h);
    }
  });

  // -------------------------------
  // SELECTIVE MEMORY RULE:
  // Keep: fitness/health answers
  // Forget: small talk or unclear 1-word replies
  // -------------------------------
  trimmedHistory = trimmedHistory.filter(h => {
    if (h.role !== "user") return true;
    if (!h.content) return false;

    const small = h.content.toLowerCase();

    if (small.length < 3) return false; // remove empty/1-word noise

    const banned = ["yes", "no", "ok", "sure", "maybe", "idk"];
    if (banned.includes(small)) return false;

    return true;
  });

  // -------------------------------
  //  **THE FIX — STRONG SYSTEM PROMPT**
  // -------------------------------
  const systemPrompt = `
You are **Exerbud**, a fitness, strength, conditioning, mobility, and recovery AI coach.

You NEVER assume:
- business context
- marketing
- entrepreneurship
- project planning
- client management
- product launches
- audience targeting

These topics are ALWAYS out of scope.

When the user answers something short like:
• "3 days"  
• "very active"  
• "health"  
• "weight loss"  

You **automatically interpret it ONLY in a fitness/health/body/training context**, NEVER business.

Your job:
- give practical strength, conditioning, and mobility recommendations  
- tailor routines around the user’s real schedule, limitations, lifestyle, and goals  
- ask clarifying question
