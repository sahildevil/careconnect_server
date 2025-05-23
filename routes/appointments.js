const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");
const { sendNotification } = require("./notifications");
const reminderService = require("../services/reminderService");

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
        status: "pending",
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
      .update({ status: "canceled", updated_at: new Date() })
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

// Update the doctor appointments endpoint with better debugging

router.get("/doctor", async (req, res) => {
  try {
    // Get the doctor ID from the authenticated user or query parameter
    const { doctor_id } = req.query;

    // Get user from token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    // Use the doctor_id from query or the authenticated user's ID
    const finalDoctorId = doctor_id || userData.user.id;

    console.log("Fetching appointments for doctor ID:", finalDoctorId);
    console.log("Token user ID:", userData.user.id);
    console.log("Query doctor_id:", doctor_id);

    // Verify the user is actually a doctor
    const { data: doctorCheck, error: doctorCheckError } = await supabase
      .from("doctors")
      .select("id, name")
      .eq("id", finalDoctorId)
      .single();

    if (doctorCheckError || !doctorCheck) {
      console.error("Doctor verification failed:", doctorCheckError);
      return res.status(403).json({
        success: false,
        message: "User is not a doctor or doctor not found",
      });
    }

    console.log("Doctor verified:", doctorCheck.name);

    // Get appointments for this doctor
    const { data, error } = await supabase
      .from("appointments")
      .select("*, patients:patient_id(*)")
      .eq("doctor_id", finalDoctorId)
      .order("appointment_date", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    console.log(
      `Found ${data?.length || 0} appointments for doctor ${finalDoctorId} (${
        doctorCheck.name
      })`
    );

    // Log appointment details for debugging
    if (data && data.length > 0) {
      console.log(
        "Appointment details:",
        data.map((apt) => ({
          id: apt.id,
          date: apt.appointment_date,
          status: apt.status,
          patient: apt.patients?.name || "Unknown",
        }))
      );
    }

    return res.status(200).json({ success: true, appointments: data || [] });
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Modify the patient appointments route
router.get("/patient", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let patientId = null;
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

    // First, get the appointment to identify the patient
    const { data: appointmentData, error: appointmentError } = await supabase
      .from("appointments")
      .select("*, patients:patient_id(*), doctors:doctor_id(*)")
      .eq("id", id)
      .single();

    if (appointmentError) {
      return res
        .status(400)
        .json({ success: false, message: appointmentError.message });
    }

    if (!appointmentData) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
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

    // Update the appointment status
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // Send notification based on approval decision
    if (appointmentData.patient_id) {
      const patientId = appointmentData.patient_id;
      const doctorName = appointmentData.doctors?.name || "Your doctor";
      const appointmentDate = new Date(appointmentData.appointment_date);

      // Format appointment date in a readable format
      const formattedDate = appointmentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (approved) {
        // Send confirmation notification
        const notificationResult = await sendNotification(
          patientId,
          "Appointment Confirmed",
          `Your appointment with Dr. ${doctorName} on ${formattedDate} at ${formattedTime} has been confirmed.`,
          "appointment_confirmed",
          id
        );
        console.log("Confirmation notification result:", notificationResult);
      } else {
        // Send rejection notification
        const notificationResult = await sendNotification(
          patientId,
          "Appointment Declined",
          `Your appointment with Dr. ${doctorName} on ${formattedDate} at ${formattedTime} was declined. ${
            notes ? `Reason: ${notes}` : ""
          }`,
          "appointment_rejected",
          id
        );
        console.log("Rejection notification result:", notificationResult);
      }
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

    // IMPORTANT: Verify authentication to ensure proper user context
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required for slot checking",
      });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    console.log(
      `User ${userData.user.id} checking slots for doctor ${doctorId} on ${date}`
    );

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

    // CRITICAL: Use supabaseAdmin to bypass RLS and get ALL appointments for this doctor/date
    // This ensures we get the complete picture regardless of which user is asking
    const { data: bookedAppointments, error } = await supabaseAdmin
      .from("appointments")
      .select("appointment_date, status, patient_id, patients:patient_id(name)")
      .eq("doctor_id", doctorId)
      .gte("appointment_date", startDate.toISOString())
      .lte("appointment_date", endDate.toISOString())
      .in("status", ["pending", "confirmed", "scheduled"]); // All active appointment statuses

    if (error) {
      console.error("Error fetching booked appointments:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    // Log all booked appointments for debugging
    console.log(
      "All booked appointments for this date:",
      bookedAppointments?.map((app) => ({
        time: app.appointment_date,
        status: app.status,
        patient: app.patients?.name || "Unknown",
      }))
    );

    // Extract the booked times in the format expected by the client
    const bookedTimes =
      bookedAppointments?.map((app) => {
        const appDate = new Date(app.appointment_date);
        // Return hours:minutes format (24-hour)
        const hours = appDate.getUTCHours().toString().padStart(2, "0");
        const minutes = appDate.getUTCMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
      }) || [];

    console.log(
      `Found ${bookedTimes.length} booked slots for doctor ${doctorId} on ${date}`
    );
    console.log("Booked slots (UTC times):", bookedTimes);

    // Add cache-busting headers to prevent caching issues
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    return res.status(200).json({
      success: true,
      bookedSlots: bookedTimes,
      date: date,
      timezone: "UTC",
      totalBookings: bookedAppointments?.length || 0,
      requestedBy: userData.user.id, // Add this for debugging
      timestamp: new Date().toISOString(), // Add timestamp to ensure fresh data
    });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Manual reminder endpoint (for testing)
router.post("/:id/send-reminder", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    // Send manual reminder
    const result = await reminderService.sendManualReminder(id);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Reminder sent successfully",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to send reminder",
      });
    }
  } catch (error) {
    console.error("Error sending manual reminder:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add this test endpoint

router.post("/test-reminder-system", async (req, res) => {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // Get confirmed appointments in the next 2 hours for testing
    const now = new Date();
    const testEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(
        `
        id,
        appointment_date,
        patients:patient_id (name),
        doctors:doctor_id (name)
      `
      )
      .eq("status", "confirmed")
      .gte("appointment_date", now.toISOString())
      .lte("appointment_date", testEnd.toISOString());

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `Found ${
        appointments?.length || 0
      } confirmed appointments in next 2 hours`,
      appointments:
        appointments?.map((apt) => ({
          id: apt.id,
          date: apt.appointment_date,
          patient: apt.patients?.name,
          doctor: apt.doctors?.name,
        })) || [],
    });
  } catch (error) {
    console.error("Error testing reminder system:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
