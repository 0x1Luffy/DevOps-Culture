// stats-service
// Reads the SAME MongoDB the backend uses and returns aggregate counts.
// Purpose: practice a "read-only sibling service" pattern that shares a DB
// with another microservice instead of owning its own.

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("stats-service: MongoDB connected"))
  .catch((err) => console.log("stats-service: Mongo connection error:", err.message));

// Same schema/collection as the backend service (must match: "tasks")
const TaskSchema = new mongoose.Schema({
  title: String,
  status: {
    type: String,
    default: "pending",
  },
});

const Task = mongoose.model("Task", TaskSchema);

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({ service: "stats-service", status: "ok", db: dbState });
});

app.get("/api/stats", async (req, res) => {
  try {
    const total = await Task.countDocuments();
    const completed = await Task.countDocuments({ status: "completed" });
    const pending = await Task.countDocuments({ status: "pending" });

    res.json({ total, completed, pending });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute stats", details: err.message });
  }
});

app.listen(process.env.PORT || 5001, () => {
  console.log(`stats-service running on port ${process.env.PORT || 5001}`);
});
