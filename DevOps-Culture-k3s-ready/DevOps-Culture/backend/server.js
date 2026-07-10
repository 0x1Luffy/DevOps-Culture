const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios"); // NEW: for the notification-service call
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

const TaskSchema = new mongoose.Schema({
  title: String,
  status: {
    type: String,
    default: "pending"
  }
});

const Task = mongoose.model("Task", TaskSchema);

// NEW: health endpoint — used by k8s probes and status-service
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({ service: "backend", status: "ok", db: dbState });
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find();
  res.json(tasks);
});

app.post("/api/tasks", async (req, res) => {
  const task = await Task.create({
    title: req.body.title
  });

  // NEW: fire-and-forget call to notification-service.
  // Wrapped so a down/missing notification-service never breaks task creation —
  // this is the "graceful degradation" pattern for service-to-service calls.
  const notificationUrl = process.env.NOTIFICATION_SERVICE_URL;
  if (notificationUrl) {
    axios
      .post(`${notificationUrl}/api/notifications`, {
        message: `New task created: "${task.title}"`
      })
      .catch(err => console.log("notification-service call failed:", err.message));
  }

  res.json(task);
});

app.put("/api/tasks/:id", async (req, res) => {
  const updated = await Task.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  );

  res.json(updated);
});

app.delete("/api/tasks/:id", async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ message: "Task deleted" });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
