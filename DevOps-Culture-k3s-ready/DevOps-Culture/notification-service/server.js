// notification-service
// Stateless, in-memory service (no DB) that logs "notifications".
// Purpose: practice a lightweight, stateless microservice + service-to-service
// calls (the backend fires a non-blocking request here on task creation).
// Being in-memory also makes it a good example for teaching why pod restarts
// lose state, and why you'd add a real store (Redis/Mongo) later.

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store — resets whenever the pod restarts. Capped at 100 entries.
let notifications = [];
const MAX_NOTIFICATIONS = 100;

app.get("/health", (req, res) => {
  res.json({ service: "notification-service", status: "ok", count: notifications.length });
});

app.get("/api/notifications", (req, res) => {
  res.json(notifications);
});

app.post("/api/notifications", (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const notification = {
    id: Date.now().toString(),
    message,
    createdAt: new Date().toISOString(),
  };

  notifications.unshift(notification);
  notifications = notifications.slice(0, MAX_NOTIFICATIONS);

  res.status(201).json(notification);
});

app.delete("/api/notifications", (req, res) => {
  notifications = [];
  res.json({ message: "Notifications cleared" });
});

app.listen(process.env.PORT || 5002, () => {
  console.log(`notification-service running on port ${process.env.PORT || 5002}`);
});
