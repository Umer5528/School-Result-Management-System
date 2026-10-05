require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");

const env = require("./config/env");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
}

// General defense-in-depth limiter across every /api route, layered
// underneath the tighter auth/public limiters below (both apply -- this
// one just catches anything that isn't already covered by a more specific
// budget, e.g. an authenticated account making an unusually high volume
// of requests).
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalApiLimiter);

// Basic rate limiting on auth endpoints (tightened further in Module 19)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "SRMS API is running", env: env.nodeEnv });
});

// Module 3+ mounted routes
const authRoutes = require("./routes/auth.routes");
const teacherRoutes = require("./routes/teachers.routes");
const resultRoutes = require("./routes/results.routes");
const announcementRoutes = require("./routes/announcements.routes");
const settingsRoutes = require("./routes/settings.routes");
const auditLogRoutes = require("./routes/auditLogs.routes");
const classProfileRoutes = require("./routes/classProfiles.routes");
const draftRoutes = require("./routes/drafts.routes");
const studentRoutes = require("./routes/students.routes");
const resultSessionRoutes = require("./routes/resultSessions.routes");
const publicRoutes = require("./routes/public.routes");

app.use("/api/auth", authRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/class-profiles", classProfileRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/result-sessions", resultSessionRoutes);
app.use("/api/public", publicRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
