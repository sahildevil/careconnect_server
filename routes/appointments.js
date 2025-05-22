const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");

// Get user appointments
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("appointments")
      .select("*, doctors(*)")
      .eq("patient_id", userId); // Changed from user_id to patient_id

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, appointments: data });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Book a new appointment
router.post("/", async (req, res) => {
  try {
    const { user_id, doctor_id, appointment_date, reason, appointment_type } =
      req.body;

    if (!user_id || !doctor_id || !appointment_date) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    console.log("Creating appointment with data:", {
      patient_id: user_id,
      doctor_id,
      appointment_date,
      reason,
      appointment_type: appointment_type || "consultation",
    });

    // Use supabaseAdmin instead of supabase to bypass RLS
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: user_id, // Map user_id from request to patient_id in database
        doctor_id,
        appointment_date,
        reason,
        appointment_type: appointment_type || "consultation",
        status: "pending", // Using 'pending' as default per your schema
        created_at: new Date(),
      })
      .select();

    if (error) {
      console.error("Appointment creation error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Cancel appointment
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date() })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get doctor's appointments
router.get("/doctor", async (req, res) => {
  try {
    // Get the doctor ID from the authenticated user
    const user = req.user; // Assuming authentication middleware sets this
    const doctorId = user ? user.id : req.query.doctor_id;

    if (!doctorId) {
      return res
        .status(400)
        .json({ success: false, message: "Doctor ID is required" });
    }

    const { data, error } = await supabase
      .from("appointments")
      .select("*, patients:patient_id(*)") // Changed from user_id to patient_id
      .eq("doctor_id", doctorId);

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, appointments: data });
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get patient's appointments
router.get("/patient", async (req, res) => {
  try {
    // Get the patient ID from the authenticated user
    const user = req.user; // Assuming authentication middleware sets this
    const patientId = user ? user.id : req.query.user_id;

    if (!patientId) {
      return res
        .status(400)
        .json({ success: false, message: "Patient ID is required" });
    }

    const { data, error } = await supabase
      .from("appointments")
      .select("*, doctors(*)")
      .eq("patient_id", patientId); // Changed from user_id to patient_id

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, appointments: data });
  } catch (error) {
    console.error("Error fetching patient appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get appointment by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("appointments")
      .select("*, doctors(*), patients:patient_id(*)") // Changed from user_id to patient_id
      .eq("id", id)
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    return res.status(200).json({ success: true, appointment: data });
  } catch (error) {
    console.error("Error fetching appointment details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update appointment status
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status is required" });
    }

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status, updated_at: new Date() })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment status updated successfully",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error updating appointment status:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
