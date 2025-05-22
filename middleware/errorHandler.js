const errorHandler = (err, req, res, next) => {
  console.error("Error details:", err);

  // Handle Supabase auth errors
  if (err.__isAuthError) {
    let statusCode = 400;
    let message = err.message || "Authentication error";

    // Specific error handling
    if (err.code === "not_admin") {
      statusCode = 403;
      message = "Admin privileges required for this operation";
    } else if (err.status === 422) {
      statusCode = 422;
      message = "Invalid input data";
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
    });
  }

  // Handle database errors
  if (err.code && err.code.startsWith("23")) {
    // Database constraint violations typically start with '23'
    return res.status(400).json({
      success: false,
      message: "Database constraint violation",
      details: err.message,
    });
  }

  // Handle all other errors
  return res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
};

module.exports = errorHandler;
