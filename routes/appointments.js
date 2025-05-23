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
        patient_id: actualPatientId,
        doctor_id,
        appointment_date,
        reason,
        appointment_type: appointment_type || "consultation",
        status: "pending", // MODIFIED: Changed from "confirmed" to "pending"
        created_at: new Date(),
      })
      .select();

    if (error) {
      console.error("Appointment creation error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(201).json({
      success: true,
      message:
        "Appointment request submitted successfully. Awaiting doctor's approval.",
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

// Modify the patient appointments route
router.get("/patient", async (req, res) => {
  try {
    // Get the patient ID from token only, don't use query parameters
    const authHeader = req.headers.authorization;
    let patientId = null;

    // Extract patient ID from token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.substring(7, authHeader.length);
    try {
      const { data } = await supabase.auth.getUser(token);
      if (data && data.user) {
        patientId = data.user.id;
        console.log("Got patient ID from token:", patientId);
      } else {
        return res
          .status(401)
          .json({ success: false, message: "Invalid authentication token" });
      }
    } catch (authError) {
      console.error("Auth error:", authError);
      return res
        .status(401)
        .json({ success: false, message: "Authentication error" });
    }

    if (!patientId) {
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

// Update the appointment detail endpoint

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
        *,
        doctors:doctor_id (
          id, 
          name, 
          email, 
          specialty, 
          avatar_url, 
          latitude, 
          longitude, 
          location_link
        ),
        patients:patient_id (*)
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching appointment:", error);
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

// Approve or reject appointment
router.put("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, notes } = req.body;

    if (approved === undefined) {
      return res.status(400).json({
        success: false,
        message: "The 'approved' field is required (true or false)",
      });
    }

    // Set status based on approval decision
    const status = approved ? "confirmed" : "canceled";

    const updateData = {
      status,
      updated_at: new Date(),
    };

    // Add notes if provided
    if (notes) {
      updateData.notes = notes;
    }

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: approved ? "Appointment confirmed" : "Appointment rejected",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error approving/rejecting appointment:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update the available slots endpoint

// Get available slots for a doctor
router.get("/available-slots/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, timezone } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required (YYYY-MM-DD format)",
      });
    }

    // Get client timezone or default to UTC
    const clientTimezone = timezone || "UTC";
    console.log(
      `Processing availability request for date ${date} in timezone ${clientTimezone}`
    );

    // Convert the date string to start/end of day in UTC
    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);

    console.log(
      "Date range (UTC):",
      startDate.toISOString(),
      "to",
      endDate.toISOString()
    );

    // Get all booked appointments for this doctor on the specified date
    const { data: bookedAppointments, error } = await supabase
      .from("appointments")
      .select("appointment_date")
      .eq("doctor_id", doctorId)
      .gte("appointment_date", startDate.toISOString())
      .lte("appointment_date", endDate.toISOString())
      .not("status", "eq", "canceled"); // Exclude canceled appointments

    if (error) {
      console.error("Error fetching booked appointments:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    // Log all booked appointments for debugging
    console.log(
      "Booked appointments (UTC):",
      bookedAppointments.map((app) => app.appointment_date)
    );

    // Extract the booked times with timezone information
    const bookedTimes = bookedAppointments.map((app) => {
      const appDate = new Date(app.appointment_date);
      // Return only hours and minutes in format suitable for comparison
      return `${appDate.getUTCHours()}:${
        appDate.getUTCMinutes() === 0 ? "00" : "30"
      }`;
    });

    console.log(
      `Found ${bookedTimes.length} booked slots for doctor ${doctorId} on ${date}`
    );
    console.log("Booked slots (time only):", bookedTimes);

    return res.status(200).json({
      success: true,
      bookedSlots: bookedTimes,
      date: date,
      timezone: "UTC", // Explicitly tell the client these times are in UTC
    });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
