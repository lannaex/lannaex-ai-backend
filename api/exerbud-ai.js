// api/exerbud-ai.js
// TEMPORARY DEBUG VERSION

module.exports = async (req, res) => {
  // Basic CORS so Shopify can call it
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Just respond with a fixed string, ignore the body completely
  return res.status(200).json({
    reply: "DEBUG: This is the SIMPLE Exerbud backend at /api/exerbud-ai. If you see this, Shopify is calling the correct route."
  });
};
