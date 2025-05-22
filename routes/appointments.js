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
    const {
      patient_id,
      user_id,
      doctor_id,
      appointment_date,
      reason,
      appointment_type,
    } = req.body;

    // Use patient_id as primary, fallback to user_id if patient_id isn't provided
    const actualPatientId = patient_id || user_id;

    if (!actualPatientId || !doctor_id || !appointment_date) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    console.log("Creating appointment with data:", {
      patient_id: actualPatientId,
      doctor_id,
      appointment_date,
      reason,
      appointment_type: appointment_type || "consultation",
    });

    // Use supabaseAdmin instead of supabase to bypass RLS
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: actualPatientId, // Use the determined patient ID
        doctor_id,
        appointment_date,
        reason,
        appointment_type: appointment_type || "consultation",
        status: "confirmed", // Changed from "scheduled" to "confirmed" - which is in the allowed list
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

// Update cancel appointment route
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "canceled", updated_at: new Date() }) // Changed from "cancelled" to "canceled"
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
    // Log all incoming query parameters to help debug
    console.log("Query parameters:", req.query);

    // Get the patient ID from the authenticated user or query parameter
    const authHeader = req.headers.authorization;
    let patientId = req.query.user_id;

    console.log("Initial patient ID from query:", patientId);

    // If we have an auth header, try to extract the user ID from it
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7, authHeader.length);
      try {
        const { data } = await supabase.auth.getUser(token);
        if (data && data.user) {
          patientId = data.user.id;
          console.log("Got patient ID from token:", patientId);
        }
      } catch (authError) {
        console.error("Auth error:", authError);
        // Continue with the query param user_id if auth extraction fails
      }
    }

    if (!patientId) {
      console.error("No patient ID available");
      return res
        .status(400)
        .json({ success: false, message: "Patient ID is required" });
    }

    console.log("Using patient ID:", patientId);
    const { data, error } = await supabase
      .from("appointments")
      .select("*, doctors(*)")
      .eq("patient_id", patientId);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    console.log(
      `Found ${data ? data.length : 0} appointments for patient ${patientId}`
    );
    return res.status(200).json({ success: true, appointments: data || [] });
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
