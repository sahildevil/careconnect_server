const cron = require("node-cron");
const { supabase } = require("../config/supabase");
const { sendNotification } = require("../routes/notifications");

class ReminderService {
  constructor() {
    this.isRunning = false;
  }

  // Start the reminder service
  start() {
    if (this.isRunning) {
      console.log("Reminder service is already running");
      return;
    }

    // Run every 5 minutes to check for upcoming appointments
    this.cronJob = cron.schedule(
      "*/5 * * * *",
      () => {
        this.checkUpcomingAppointments();
      },
      {
        scheduled: false,
      }
    );

    this.cronJob.start();
    this.isRunning = true;
    console.log(
      "Appointment reminder service started - checking every 5 minutes"
    );
  }

  // Stop the reminder service
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log("Appointment reminder service stopped");
    }
  }

  // Check for appointments that need reminders
  async checkUpcomingAppointments() {
    try {
      console.log("Checking for upcoming appointments...");

      // Calculate time range: 55-65 minutes from now (to catch appointments needing 1-hour reminders)
      const now = new Date();
      const reminderStart = new Date(now.getTime() + 55 * 60 * 1000); // 55 minutes from now
      const reminderEnd = new Date(now.getTime() + 65 * 60 * 1000); // 65 minutes from now

      // Get confirmed appointments in the reminder time window
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select(
          `
          id,
          appointment_date,
          patient_id,
          doctor_id,
          reminder_sent,
          doctors:doctor_id (
            id,
            name,
            specialty,
            latitude,
            longitude,
            location_link
          ),
          patients:patient_id (
            id,
            name
          )
        `
        )
        .eq("status", "confirmed")
        .gte("appointment_date", reminderStart.toISOString())
        .lte("appointment_date", reminderEnd.toISOString())
        .or("reminder_sent.is.null,reminder_sent.eq.false");

      if (error) {
        console.error("Error fetching appointments for reminders:", error);
        return;
      }

      if (!appointments || appointments.length === 0) {
        console.log("No appointments found needing reminders");
        return;
      }

      console.log(
        `Found ${appointments.length} appointments needing reminders`
      );

      // Send reminders for each appointment
      for (const appointment of appointments) {
        await this.sendAppointmentReminder(appointment);
      }
    } catch (error) {
      console.error("Error in checkUpcomingAppointments:", error);
    }
  }

  // Send reminder notification for a specific appointment
  async sendAppointmentReminder(appointment) {
    try {
      const appointmentDate = new Date(appointment.appointment_date);
      const doctorData = appointment.doctors;
      const patientData = appointment.patients;

      // Format appointment time
      const formattedDate = appointmentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Create reminder message
      const title = "Appointment Reminder";
      let message = `Your appointment with Dr. ${doctorData.name} is in 1 hour (${formattedTime}).`;

      // Add location info if available
      if (doctorData.latitude && doctorData.longitude) {
        message += " Tap for directions to the clinic.";
      }

      // Send the notification
      const notificationResult = await sendNotification(
        appointment.patient_id,
        title,
        message,
        "appointment_reminder",
        appointment.id
      );

      if (notificationResult.success) {
        // Mark reminder as sent in the database
        await supabase
          .from("appointments")
          .update({
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq("id", appointment.id);

        console.log(
          `Reminder sent for appointment ${appointment.id} (Patient: ${patientData.name}, Doctor: ${doctorData.name})`
        );
      } else {
        console.error(
          `Failed to send reminder for appointment ${appointment.id}:`,
          notificationResult.error
        );
      }
    } catch (error) {
      console.error(
        `Error sending reminder for appointment ${appointment.id}:`,
        error
      );
    }
  }

  // Manual method to send reminder for specific appointment (for testing)
  async sendManualReminder(appointmentId) {
    try {
      const { data: appointment, error } = await supabase
        .from("appointments")
        .select(
          `
          id,
          appointment_date,
          patient_id,
          doctor_id,
          doctors:doctor_id (
            id,
            name,
            specialty,
            latitude,
            longitude,
            location_link
          ),
          patients:patient_id (
            id,
            name
          )
        `
        )
        .eq("id", appointmentId)
        .single();

      if (error || !appointment) {
        throw new Error("Appointment not found");
      }

      await this.sendAppointmentReminder(appointment);
      return { success: true, message: "Manual reminder sent successfully" };
    } catch (error) {
      console.error("Error sending manual reminder:", error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const reminderService = new ReminderService();

module.exports = reminderService;
