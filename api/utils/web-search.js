// api/utils/web-search.js

// Uses Tavily's HTTP API for lightweight web search.
// Make sure TAVILY_API_KEY is set in your Vercel env.

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

async function webSearch(query, options = {}) {
  if (!TAVILY_API_KEY) {
    console.warn("TAVILY_API_KEY is not set; skipping web search.");
    return null;
  }

  const body = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: options.search_depth || "basic", // "basic" or "advanced"
    max_results: options.max_results || 5,
    include_images: false,
    include_answers: true,
    include_raw_content: false,
  };

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error("Tavily search error status:", resp.status);
      return null;
    }

    const data = await resp.json();

    const chunks = [];

    if (data.answer) {
      chunks.push(`High-level answer:\n${data.answer}`);
    }

    if (Array.isArray(data.results)) {
      data.results.forEach((r, idx) => {
        const title = r.title || `Result ${idx + 1}`;
        const content = r.content || "";
        const url = r.url || "";
        chunks.push(
          `Source ${idx + 1}: ${title}\n${content}\nURL: ${url}`.trim()
        );
      });
    }

    if (!chunks.length) return null;
    return chunks.join("\n\n");
  } catch (err) {
    console.error("Tavily search exception:", err);
    return null;
  }
}

// Very simple heuristic: only call search when it looks like
// the user wants *live / external* info.
function shouldUseSearch(message = "") {
  const m = message.toLowerCase();

  const keywords = [
    "latest",
    "current",
    "right now",
    "updated",
    "today",
    "this week",
    "this month",
    "news",
    "trending",
    "recent",
    "price of",
    "cost of",
    "how much is",
    "exchange rate",
    "flight status",
    "weather",
    "open now",
    "opening hours",
    "reviews",
    "hotel",
    "restaurant",
    "2023",
    "2024",
    "2025",
  ];

  return keywords.some((k) => m.includes(k));
}

module.exports = {
  webSearch,
  shouldUseSearch,
};
