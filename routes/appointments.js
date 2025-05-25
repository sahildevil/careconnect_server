const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");
const { sendNotification } = require("./notifications");
const reminderService = require("../services/reminderService");
const { formatAppointmentMessage } = require("../utils/timeUtils");

// Get user appointments
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("appointments")
      .select("*, doctors(*)")
      .eq("patient_id", userId);

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

// Doctor appointments endpoint
router.get("/doctor", async (req, res) => {
  try {
    const { doctor_id } = req.query;
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(
      `[${requestId}] Doctor appointments request - Query doctor_id: ${doctor_id}`
    );

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
      console.log(`[${requestId}] Auth failed:`, userError?.message);
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const finalDoctorId = doctor_id || userData.user.id;

    console.log(
      `[${requestId}] Doctor appointments - Token user ID: ${userData.user.id}`
    );
    console.log(
      `[${requestId}] Doctor appointments - Final doctor ID: ${finalDoctorId}`
    );
    console.log(
      `[${requestId}] Doctor appointments - Query doctor_id: ${doctor_id}`
    );

    // Verify the user is actually a doctor
    const { data: doctorCheck, error: doctorCheckError } = await supabaseAdmin
      .from("doctors")
      .select("id, name")
      .eq("id", finalDoctorId)
      .single();

    if (doctorCheckError || !doctorCheck) {
      console.error(
        `[${requestId}] Doctor verification failed:`,
        doctorCheckError
      );
      return res.status(403).json({
        success: false,
        message: "User is not a doctor or doctor not found",
        requestId,
      });
    }

    console.log(
      `[${requestId}] Doctor verified: ${doctorCheck.name} (ID: ${doctorCheck.id})`
    );
    const { data: allAppointments, error: allError } = await supabaseAdmin
      .from("appointments")
      .select("id, doctor_id, patient_id, status, appointment_date")
      .eq("doctor_id", finalDoctorId);

    console.log(
      `[${requestId}] ALL appointments in database for doctor ${finalDoctorId}:`,
      {
        count: allAppointments?.length || 0,
        appointments:
          allAppointments?.map((apt) => ({
            id: apt.id,
            patient_id: apt.patient_id,
            status: apt.status,
            date: apt.appointment_date,
          })) || [],
      }
    );

    if (allError) {
      console.error(
        `[${requestId}] Error checking all appointments:`,
        allError
      );
    }

    // Get appointments for this doctor with patient details
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select(
        `
        *,
        patients:patient_id (
          id,
          name,
          email
        )
      `
      )
      .eq("doctor_id", finalDoctorId)
      .order("appointment_date", { ascending: true });

    if (error) {
      console.error(
        `[${requestId}] Error fetching appointments with patient details:`,
        error
      );
      return res.status(400).json({
        success: false,
        message: error.message,
        requestId,
      });
    }

    console.log(
      `[${requestId}] Found ${
        data?.length || 0
      } appointments for doctor ${finalDoctorId} (${doctorCheck.name})`
    );

    // Log appointment details for debugging
    if (data && data.length > 0) {
      console.log(
        `[${requestId}] Appointment details:`,
        data.map((apt) => ({
          id: apt.id,
          date: apt.appointment_date,
          status: apt.status,
          patient: apt.patients?.name || "Unknown",
        }))
      );
    } else {
      console.log(
        `[${requestId}] No appointments found - checking database directly...`
      );

      // Double-check with raw query
      const { data: rawCheck, error: rawError } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("doctor_id", finalDoctorId);

      console.log(`[${requestId}] Raw appointment check:`, {
        count: rawCheck?.length || 0,
        error: rawError?.message,
        rawData: rawCheck,
      });
    }

    return res.status(200).json({
      success: true,
      appointments: data || [],
      requestId,
      debug: {
        doctorId: finalDoctorId,
        doctorName: doctorCheck.name,
        totalFound: data?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Patient appointments endpoint
router.get("/patient", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.substring(7, authHeader.length);
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(
      `[${requestId}] Processing appointment request with token: ${token.substring(
        0,
        20
      )}...`
    );

    try {
      const { data, error: authError } = await supabase.auth.getUser(token);

      if (authError || !data || !data.user) {
        console.log(`[${requestId}] Auth failed:`, authError?.message);
        return res
          .status(401)
          .json({ success: false, message: "Invalid authentication token" });
      }

      const patientId = data.user.id;
      console.log(`[${requestId}] Got patient ID from token: ${patientId}`);
      const queryTimestamp = new Date().toISOString();
      console.log(
        `[${requestId}] Using patient ID: ${patientId} at ${queryTimestamp}`
      );
      const { data: appointments, error: appointmentsError } =
        await supabaseAdmin
          .from("appointments")
          .select("*, doctors(*)")
          .eq("patient_id", patientId)
          .order("appointment_date", { ascending: true });

      if (appointmentsError) {
        console.error(`[${requestId}] Supabase error:`, appointmentsError);
        return res.status(400).json({
          success: false,
          message: appointmentsError.message,
          requestId,
        });
      }

      console.log(
        `[${requestId}] Found ${
          appointments?.length || 0
        } appointments for patient ${patientId}`
      );

      return res.status(200).json({
        success: true,
        appointments: appointments || [],
        userId: patientId,
        requestId,
        timestamp: queryTimestamp,
      });
    } catch (authError) {
      console.error(`[${requestId}] Auth error:`, authError);
      return res
        .status(401)
        .json({ success: false, message: "Authentication error" });
    }
  } catch (error) {
    console.error("Error fetching patient appointments:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Appointment detail endpoint
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(`[${requestId}] Fetching appointment details for ID: ${id}`);

    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        requestId,
      });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      console.log(`[${requestId}] Auth failed:`, userError?.message);
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
        requestId,
      });
    }

    const userId = userData.user.id;
    console.log(`[${requestId}] Request from user: ${userId}`);

    // First, check if the appointment exists and the user has access to it
    const { data: appointmentCheck, error: checkError } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_id, doctor_id")
      .eq("id", id)
      .single();

    if (checkError || !appointmentCheck) {
      console.log(
        `[${requestId}] Appointment not found or access denied:`,
        checkError?.message
      );
      return res.status(404).json({
        success: false,
        message: "Appointment not found or access denied",
        requestId,
      });
    }

    // Verify user has access to this appointment (either as patient or doctor)
    const hasAccess =
      appointmentCheck.patient_id === userId ||
      appointmentCheck.doctor_id === userId;

    if (!hasAccess) {
      console.log(
        `[${requestId}] User ${userId} does not have access to appointment ${id}`
      );
      return res.status(403).json({
        success: false,
        message:
          "Access denied - you don't have permission to view this appointment",
        requestId,
      });
    }

    // Fetch the full appointment details
    const { data, error } = await supabaseAdmin
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
          location_link,
          consultation_fee
        ),
        patients:patient_id (
          id,
          name,
          email
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error(
        `[${requestId}] Error fetching appointment details:`,
        error
      );
      return res.status(400).json({
        success: false,
        message: error.message,
        requestId,
      });
    }

    if (!data) {
      console.log(`[${requestId}] No appointment data returned for ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
        requestId,
      });
    }

    console.log(
      `[${requestId}] Successfully fetched appointment details for ID: ${id}`
    );

    return res.status(200).json({
      success: true,
      appointment: data,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching appointment details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching appointment details",
    });
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

// Approval endpoint with better debugging

router.put("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, notes } = req.body;
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(`[${requestId}] Approval request for appointment ${id}:`, {
      approved,
      notes,
      body: req.body,
    });

    if (approved === undefined) {
      console.log(`[${requestId}] Missing 'approved' field in request body`);
      return res.status(400).json({
        success: false,
        message: "The 'approved' field is required (true or false)",
        requestId,
      });
    }

    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log(`[${requestId}] Missing or invalid authorization header`);
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        requestId,
      });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token
    );

    if (userError || !userData.user) {
      console.log(`[${requestId}] Authentication failed:`, userError?.message);
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
        requestId,
      });
    }

    const doctorId = userData.user.id;
    console.log(`[${requestId}] Request from doctor: ${doctorId}`);

    // Fetch appointment details to verify
    const { data: appointmentData, error: appointmentError } =
      await supabaseAdmin
        .from("appointments")
        .select(
          `
        *,
        patients:patient_id (
          id,
          name,
          email
        ),
        doctors:doctor_id (
          id,
          name,
          specialty
        )
      `
        )
        .eq("id", id)
        .single();

    if (appointmentError) {
      console.error(
        `[${requestId}] Error fetching appointment:`,
        appointmentError
      );
      return res.status(400).json({
        success: false,
        message: appointmentError.message,
        requestId,
      });
    }

    if (!appointmentData) {
      console.log(`[${requestId}] Appointment not found: ${id}`);
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
        requestId,
      });
    }

    // Verify the doctor has permission to approve this appointment
    if (appointmentData.doctor_id !== doctorId) {
      console.log(
        `[${requestId}] Access denied - doctor ${doctorId} cannot approve appointment for doctor ${appointmentData.doctor_id}`
      );
      return res.status(403).json({
        success: false,
        message: "You don't have permission to approve this appointment",
        requestId,
      });
    }

    console.log(`[${requestId}] Appointment found:`, {
      id: appointmentData.id,
      currentStatus: appointmentData.status,
      patientId: appointmentData.patient_id,
      doctorId: appointmentData.doctor_id,
      date: appointmentData.appointment_date,
    });

    // Check if appointment is in a state that can be approved/rejected
    if (appointmentData.status !== "pending") {
      console.log(
        `[${requestId}] Cannot approve/reject appointment with status: ${appointmentData.status}`
      );
      return res.status(400).json({
        success: false,
        message: `Cannot approve/reject appointment with status: ${appointmentData.status}`,
        requestId,
      });
    }

    // Set status based on approval decision
    const newStatus = approved ? "confirmed" : "canceled";

    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (notes) {
      updateData.notes = notes;
    }

    console.log(`[${requestId}] Updating appointment with data:`, updateData);

    // Update the appointment status
    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from("appointments")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        patients:patient_id (
          id,
          name,
          email
        ),
        doctors:doctor_id (
          id,
          name,
          specialty
        )
      `
      )
      .single();

    if (updateError) {
      console.error(`[${requestId}] Error updating appointment:`, updateError);
      return res.status(400).json({
        success: false,
        message: updateError.message,
        requestId,
      });
    }

    console.log(`[${requestId}] Appointment updated successfully:`, {
      id: updatedData.id,
      newStatus: updatedData.status,
      updatedAt: updatedData.updated_at,
    });

    // Send notification to patient
    if (appointmentData.patient_id) {
      const patientId = appointmentData.patient_id;
      const doctorName = appointmentData.doctors?.name || "Your doctor";

      try {
        if (approved) {
          // Send confirmation notification
          const message = formatAppointmentMessage(
            doctorName,
            appointmentData.appointment_date,
            "confirmed"
          );

          const notificationResult = await sendNotification(
            patientId,
            "Appointment Confirmed",
            message,
            "appointment_confirmed",
            id
          );
          console.log(
            `[${requestId}] Confirmation notification result:`,
            notificationResult.success
          );
        } else {
          // Send rejection notification
          const message = formatAppointmentMessage(
            doctorName,
            appointmentData.appointment_date,
            "declined",
            notes
          );

          const notificationResult = await sendNotification(
            patientId,
            "Appointment Declined",
            message,
            "appointment_rejected",
            id
          );
          console.log(
            `[${requestId}] Rejection notification result:`,
            notificationResult.success
          );
        }
      } catch (notificationError) {
        console.error(
          `[${requestId}] Error sending notification:`,
          notificationError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: approved
        ? "Appointment confirmed successfully"
        : "Appointment rejected successfully",
      appointment: updatedData,
      requestId,
    });
  } catch (error) {
    console.error("Error in appointment approval:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during appointment approval",
      error: error.message,
    });
  }
});

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
    // Verify authentication
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
