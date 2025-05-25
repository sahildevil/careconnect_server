const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");

// Register a patient
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone_number } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

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

// Register a doctor
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

    if (authError) {
      console.error("Auth error:", authError);
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
      onboarding_complete: false, 
      is_visible: false, 
      created_at: new Date(),
      updated_at: new Date(),
    };

    console.log("Inserting doctor record:", doctorData);
    const { error: doctorError } = await supabaseAdmin
      .from("doctors")
      .insert(doctorData);

    if (doctorError) {
      console.error("Doctor creation error:", doctorError);
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
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(
      `[${requestId}] Login attempt for email: ${email}, userType: ${userType}`
    );

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }
    const { createClient } = require("@supabase/supabase-js");
    const loginSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Sign in with email and password using fresh instance
    const { data, error } = await loginSupabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      console.log(`[${requestId}] Login failed: ${error.message}`);
      return res.status(401).json({
        success: false,
        message: error.message,
        requestId,
      });
    }

    console.log(
      `[${requestId}] Supabase login successful for user: ${data.user.id}`
    );

    // Verify user type matches
    const userMetadata = data.user.user_metadata;
    if (userMetadata.user_type !== userType) {
      console.log(
        `[${requestId}] User type mismatch: expected ${userType}, got ${userMetadata.user_type}`
      );
      return res.status(403).json({
        success: false,
        message: `This account is not registered as a ${userType}`,
        requestId,
      });
    }

    // Get user profile data using supabaseAdmin to ensure consistency
    const { supabaseAdmin } = require("../config/supabase");
    let profileData = null;

    if (userType === "doctor") {
      const { data: doctorData, error: doctorError } = await supabaseAdmin
        .from("doctors")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (doctorError) {
        console.error(
          `[${requestId}] Error fetching doctor data:`,
          doctorError
        );
      } else {
        profileData = doctorData;
      }
    } else if (userType === "patient") {
      const { data: patientData, error: patientError } = await supabaseAdmin
        .from("patients")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (patientError) {
        console.error(
          `[${requestId}] Error fetching patient data:`,
          patientError
        );
      } else {
        profileData = patientData;
      }
    }

    const userResponse = {
      id: data.user.id,
      email: data.user.email,
      user_type: userType,
      name: profileData?.name || "",
      profile: profileData,
    };

    console.log(
      `[${requestId}] Login successful for user: ${data.user.id} (${userType})`
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: data.session.access_token,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
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

// Validate token endpoint
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
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(
      `[${requestId}] Validating token: ${token.substring(
        0,
        20
      )}... at ${new Date().toISOString()}`
    );

    try {
      const { createClient } = require("@supabase/supabase-js");
      const freshSupabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      const { data, error } = await freshSupabase.auth.getUser(token);

      if (error) {
        console.log(`[${requestId}] Token validation failed: ${error.message}`);
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
          error: error.message,
          requestId,
        });
      }

      if (!data || !data.user) {
        console.log(`[${requestId}] No user data found for token`);
        return res.status(401).json({
          success: false,
          message: "Invalid token - no user data",
          requestId,
        });
      }

      const userId = data.user.id;
      console.log(`[${requestId}] Token validated for user: ${userId}`);

      // Get updated user profile with isolation
      let userProfile = null;

      // Use supabaseAdmin for consistent data access
      const { supabaseAdmin } = require("../config/supabase");

      // Check if it's a doctor first
      const { data: doctorData, error: doctorError } = await supabaseAdmin
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
        const { data: patientData, error: patientError } = await supabaseAdmin
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
        console.log(
          `[${requestId}] User profile not found for user: ${userId}`
        );
        return res.status(404).json({
          success: false,
          message: "User profile not found",
          requestId,
        });
      }

      console.log(
        `[${requestId}] Token validation successful for user: ${userId} (${userProfile.user_type})`
      );

      return res.status(200).json({
        success: true,
        message: "Token is valid",
        user: userProfile,
        timestamp: new Date().toISOString(),
        requestId,
      });
    } catch (supabaseError) {
      console.error(
        `[${requestId}] Supabase error during token validation:`,
        supabaseError
      );
      return res.status(401).json({
        success: false,
        message: "Token validation failed",
        error: supabaseError.message,
        requestId,
      });
    }
  } catch (error) {
    console.error("Error validating token:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during token validation",
    });
  }
});

// Get user profile (generic endpoint for both patient and doctor)
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
