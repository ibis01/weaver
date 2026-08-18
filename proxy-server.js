// ========== proxy-server.js (complete file) ==========
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 3001;

// Enable CORS for your Weaver frontend
app.use(
  cors({
    origin: [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:3000",
    ],
  }),
);

// Proxy endpoint
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing ?url= parameter");
  }

  try {
    console.log(`[Proxy] Fetching: ${targetUrl}`);

    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 10000, // 10 seconds
      responseType: "text",
    });

    console.log(
      `[Proxy] ✅ Success: ${targetUrl} (${response.data.length} bytes)`,
    );
    res.set(
      "Content-Type",
      response.headers["content-type"] || "application/xml",
    );
    res.send(response.data);
  } catch (error) {
    console.error(`[Proxy] ❌ Error: ${targetUrl}`, error.message);

    if (error.response) {
      return res.status(error.response.status).send(error.response.data);
    }
    res.status(500).send(`Proxy error: ${error.message}`);
  }
});

// Health check
app.get("/health", (req, res) => {
  res.send("Proxy is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Weaver proxy server running on http://localhost:${PORT}`);
  console.log(`   Use: http://localhost:${PORT}/proxy?url=ENCODED_URL`);
});
