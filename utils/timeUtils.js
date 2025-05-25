/**
 * Convert appointment date to IST and format for notifications
 * @param {Date|string} appointmentDate - Appointment date (should be in UTC)
 * @returns {Object} - Formatted date and time in IST
 */
const formatDateTimeForIST = (appointmentDate) => {
  // Parse the appointment date - it should already be in UTC
  const utcDate = new Date(appointmentDate);

  // Format directly in IST timezone without manual offset calculation
  const formattedDate = utcDate.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const formattedTime = utcDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  return {
    date: formattedDate,
    time: formattedTime,
    dateTime: `${formattedDate} at ${formattedTime} IST`,
  };
};

/**
 * Format appointment message with IST time
 * @param {string} doctorName - Doctor's name
 * @param {Date|string} appointmentDate - Appointment date in UTC
 * @param {string} action - 'confirmed' or 'declined' or 'reminder'
 * @param {string} notes - Optional notes for declined appointments
 * @returns {string} - Formatted message
 */
const formatAppointmentMessage = (
  doctorName,
  appointmentDate,
  action,
  notes = ""
) => {
  const { dateTime, time } = formatDateTimeForIST(appointmentDate);

  if (action === "confirmed") {
    return `Your appointment with Dr. ${doctorName} on ${dateTime} has been confirmed.`;
  } else if (action === "declined") {
    return `Your appointment with Dr. ${doctorName} on ${dateTime} was declined.${
      notes ? ` Reason: ${notes}` : ""
    }`;
  } else if (action === "reminder") {
    return `Your appointment with Dr. ${doctorName} is in 1 hour (${time} IST).`;
  }

  return `Appointment update for Dr. ${doctorName} on ${dateTime}.`;
};

module.exports = {
  formatDateTimeForIST,
  formatAppointmentMessage,
};
