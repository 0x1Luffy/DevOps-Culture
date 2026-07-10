// auth-service
// Minimal JWT login service, deliberately simple: one demo user defined via
// env vars (backed by a K8s Secret), no DB.
// Purpose: practice managing secrets (JWT_SECRET, ADMIN_PASSWORD) in K8s and
// a token-issue/verify split across two endpoints.
//
// NOTE: this is a learning project. Plaintext password comparison is fine
// here for practicing DevOps mechanics, but don't reuse this auth logic
// in anything real — hash passwords (bcrypt) for production use.

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.get("/health", (req, res) => {
  res.json({ service: "auth-service", status: "ok" });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token, expiresIn: 3600 });
});

app.get("/api/verify", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, username: decoded.username });
  } catch (err) {
    res.status(401).json({ valid: false, error: "Invalid or expired token" });
  }
});

app.listen(process.env.PORT || 5003, () => {
  console.log(`auth-service running on port ${process.env.PORT || 5003}`);
});
