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

module.exports = router;
