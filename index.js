require("dotenv").config();
const express = require("express");
const cors = require("cors");
const reminderService = require("./services/reminderService");

// Import routes
const authRoutes = require("./routes/auth");
const doctorRoutes = require("./routes/doctors");
const appointmentRoutes = require("./routes/appointments");
const { router: notificationsRouter } = require("./routes/notifications");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationsRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

const errorHandler = require("./middleware/errorHandler");

// 404 Not Found handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start the reminder service
  reminderService.start();
  console.log("Appointment reminder service initialized");
});

// Shutdown
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  reminderService.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down server...");
  reminderService.stop();
  process.exit(0);
});
