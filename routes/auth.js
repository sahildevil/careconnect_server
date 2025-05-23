const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");

// Register a patient - Update this section
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone_number } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    // Directly try to create the user without checking first
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          name,
          user_type: "patient",
        },
      });

    if (authError) {
      console.error("Auth error:", authError);

      // Check if this is a duplicate email error
      if (
        authError.message &&
        (authError.message.includes("already been registered") ||
          authError.message.includes("already exists"))
      ) {
        return res.status(400).json({
          success: false,
          message: "Email is already registered",
        });
      }

      return res.status(400).json({
        success: false,
        message: authError.message,
      });
    }

    // Rest of your code remains the same...
    if (!authData || !authData.user) {
      return res.status(500).json({
        success: false,
        message: "Failed to create user account",
      });
    }

    // Create user profile in the database
    const { error: profileError } = await supabaseAdmin
      .from("patients")
      .insert({
        id: authData.user.id,
        name,
        email: email.toLowerCase(),
        phone_number: phone_number || null,
        gender: null,
        date_of_birth: null,
        blood_group: null,
        address: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

    if (profileError) {
      console.error("Patient profile creation error:", profileError);

      // Try to clean up the auth user if profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error("Error deleting auth user:", deleteError);
      }

      return res.status(400).json({
        success: false,
        message: profileError.message || "Failed to create patient profile",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      user: {
        id: authData.user.id,
        email: authData.user.email,
        user_type: "patient",
      },
    });
  } catch (error) {
    console.error("Error registering patient:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

// Register a doctor - Update this section
router.post("/doctor-signup", async (req, res) => {
  try {
    console.log("Doctor signup request:", req.body);
    const {
      name,
      email,
      password,
      phone_number,
      specialty,
      qualification,
      experience,
    } = req.body;

    if (!name || !email || !password || !specialty) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Directly try to create the user without checking first
    // If the email exists, Supabase will return an appropriate error
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          name,
          user_type: "doctor",
          phone_number,
        },
      });

    // Handle specific auth error for existing user
    if (authError) {
      console.error("Auth error:", authError);

      // Check if this is a duplicate email error
      if (
        authError.message &&
        (authError.message.includes("already been registered") ||
          authError.message.includes("already exists"))
      ) {
        return res.status(400).json({
          success: false,
          message: "Email is already registered",
        });
      }

      return res.status(400).json({
        success: false,
        message: authError.message || "Authentication error",
      });
    }

    // Rest of your code remains the same
    if (!authData || !authData.user) {
      return res.status(500).json({
        success: false,
        message: "Failed to create user account",
      });
    }

    // Create doctor record in the database
    const doctorData = {
      id: authData.user.id,
      name,
      specialty,
      experience: experience || 0,
      qualification: qualification || "",
      bio: "",
      consultation_fee: 0,
      rating: 0,
      available_days: null,
      available_hours: null,
      avatar_url: null,
      location_link: null,
      onboarding_complete: false, // Flag to track onboarding status
      is_visible: false, // Doctor not visible to patients until onboarding is complete
      created_at: new Date(),
      updated_at: new Date(),
    };

    console.log("Inserting doctor record:", doctorData);
    // Use supabaseAdmin instead of supabase for insertion
    const { error: doctorError } = await supabaseAdmin
      .from("doctors")
      .insert(doctorData);

    if (doctorError) {
      console.error("Doctor creation error:", doctorError);

      // Clean up the auth user if doctor profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        console.log("Deleted auth user after doctor creation failed");
      } catch (deleteError) {
        console.error("Error deleting auth user:", deleteError);
      }

      return res.status(400).json({
        success: false,
        message: doctorError.message || "Failed to create doctor profile",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Doctor registered successfully",
      user: {
        id: authData.user.id,
        email: authData.user.email,
        user_type: "doctor",
      },
    });
  } catch (error) {
    console.error("Error registering doctor:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

// Login user (patient or doctor)
router.post("/login", async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    // Sign in with email and password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ success: false, message: error.message });
    }

    // Check if user type matches
    const userMetadata = data.user.user_metadata;
    if (userMetadata.user_type !== userType) {
      return res.status(403).json({
        success: false,
        message: `This account is not registered as a ${userType}`,
      });
    }

    // Get user profile data
    let profileData = null;
    if (userType === "doctor") {
      const { data: doctorData, error: doctorError } = await supabase
        .from("doctors")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (doctorError) {
        console.error("Error fetching doctor data:", doctorError);
      } else {
        profileData = doctorData;
      }
    } else if (userType === "patient") {
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (patientError) {
        console.error("Error fetching patient data:", patientError);
      } else {
        profileData = patientData;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userMetadata.name,
        user_type: userMetadata.user_type,
        profile: profileData,
      },
      token: data.session.access_token, // Make sure to include this
      session: data.session,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset instructions sent to your email",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Logout user
router.post("/logout", async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res
      .status(200)
      .json({ success: true, message: "Logout successful" });
  } catch (error) {
    console.error("Error logging out:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update user location
// This should be in your server's auth.js routes file
router.post("/update-location", async (req, res) => {
  try {
    console.log("Received location update request:", req.body);
    const { userId, latitude, longitude, last_location_update } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
      });
    }

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    // Update the patient's location in the database
    const { data, error } = await supabase
      .from("patients")
      .update({
        latitude,
        longitude,
        last_location_update: last_location_update || new Date().toISOString(),
      })
      .eq("id", userId)
      .select();

    if (error) {
      console.error("Supabase update error:", error);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.log("Location updated successfully for user:", userId);
    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    console.error("Error updating location:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user profile
router.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify the token matches the requested user ID
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

    // Ensure the token user matches the requested user
    if (userData.user.id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Get user profile based on user type
    let userProfile = null;

    // Check if it's a doctor
    const { data: doctorData, error: doctorError } = await supabase
      .from("doctors")
      .select("*")
      .eq("id", userId)
      .single();

    if (doctorData && !doctorError) {
      userProfile = {
        ...doctorData,
        user_type: "doctor",
      };
    } else {
      // Check if it's a patient
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", userId)
        .single();

      if (patientData && !patientError) {
        userProfile = {
          ...patientData,
          user_type: "patient",
        };
      }
    }

    if (!userProfile) {
      return res
        .status(404)
        .json({ success: false, message: "User profile not found" });
    }

    console.log(
      "Profile retrieved for user:",
      userId,
      "type:",
      userProfile.user_type
    );

    return res.status(200).json({
      success: true,
      user: userProfile,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add this improved validate-token endpoint

router.get("/validate-token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No authorization token provided",
      });
    }

    const token = authHeader.substring(7, authHeader.length);

    // Verify the JWT token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.log("Token validation failed:", error?.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Get updated user profile
    const userId = data.user.id;
    let userProfile = null;

    // Check if it's a doctor
    const { data: doctorData, error: doctorError } = await supabase
      .from("doctors")
      .select("*")
      .eq("id", userId)
      .single();

    if (doctorData && !doctorError) {
      userProfile = {
        id: userId,
        email: data.user.email,
        name: doctorData.name,
        user_type: "doctor",
        profile: doctorData,
      };
    } else {
      // Check if it's a patient
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("id", userId)
        .single();

      if (patientData && !patientError) {
        userProfile = {
          id: userId,
          email: data.user.email,
          name: patientData.name,
          user_type: "patient",
          profile: patientData,
        };
      }
    }

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Token is valid",
      user: userProfile,
    });
  } catch (error) {
    console.error("Error validating token:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during token validation",
    });
  }
});

// Add this endpoint if it doesn't exist already
router.get("/profile", async (req, res) => {
  try {
    // Get user ID from the auth token
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

    const userId = userData.user.id;

    // First check if user is a patient
    let { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("*")
      .eq("id", userId)
      .single();

    let userType = "patient";

    if (patientError || !patientData) {
      // If not a patient, try doctor
      const { data: doctorData, error: doctorError } = await supabase
        .from("doctors")
        .select("*")
        .eq("id", userId)
        .single();

      if (doctorError || !doctorData) {
        return res
          .status(404)
          .json({ success: false, message: "User profile not found" });
      }

      userType = "doctor";
      patientData = doctorData;
    }

    return res.status(200).json({
      success: true,
      user: {
        id: userId,
        email: userData.user.email,
        user_type: userType,
        profile: patientData,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
