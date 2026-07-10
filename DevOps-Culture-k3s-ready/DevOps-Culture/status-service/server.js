// status-service
// Aggregator/gateway pattern: on request, pings /health on every other
// service using their K8s Service DNS names (or docker-compose service
// names locally) and returns a combined system status.
// Purpose: practice service discovery, DNS-based service-to-service comms,
// and the "status page" pattern you'll see in real platforms.

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Defaults match the K8s Service names in this repo's k8s/ manifests.
// Override via env vars for local docker-compose runs if needed.
const SERVICES = {
  backend: process.env.BACKEND_HEALTH_URL || "http://taskflow-backend:5000/health",
  "stats-service": process.env.STATS_HEALTH_URL || "http://taskflow-stats-service:5001/health",
  "notification-service":
    process.env.NOTIFICATION_HEALTH_URL || "http://taskflow-notification-service:5002/health",
  "auth-service": process.env.AUTH_HEALTH_URL || "http://taskflow-auth-service:5003/health",
};

app.get("/health", (req, res) => {
  res.json({ service: "status-service", status: "ok" });
});

app.get("/api/status", async (req, res) => {
  const results = {};

  await Promise.all(
    Object.entries(SERVICES).map(async ([name, url]) => {
      try {
        const start = Date.now();
        await axios.get(url, { timeout: 3000 });
        results[name] = { status: "up", latencyMs: Date.now() - start };
      } catch (err) {
        results[name] = { status: "down", error: err.code || err.message };
      }
    })
  );

  const allUp = Object.values(results).every((r) => r.status === "up");

  res.json({
    overall: allUp ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    services: results,
  });
});

app.listen(process.env.PORT || 5004, () => {
  console.log(`status-service running on port ${process.env.PORT || 5004}`);
});
