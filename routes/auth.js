const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

// Register a patient
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone_number } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          user_type: "patient",
        },
      },
    });

    if (authError) {
      return res
        .status(400)
        .json({ success: false, message: authError.message });
    }

    // Create user profile in the database
    const { error: profileError } = await supabase.from("patients").upsert(
      {
        id: authData.user.id,
        name,
        email,
        phone_number,
        user_type: "patient",
        created_at: new Date(),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("Profile creation error:", profileError);
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
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Register a doctor
router.post("/doctor-signup", async (req, res) => {
  try {
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
      return res
        .status(400)
        .json({
          success: false,
          message: "All required fields must be provided",
        });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          user_type: "doctor",
        },
      },
    });

    if (authError) {
      return res
        .status(400)
        .json({ success: false, message: authError.message });
    }

    // Create user profile
    const { error: profileError } = await supabase.from("patients").upsert(
      {
        id: authData.user.id,
        name,
        email,
        phone_number,
        user_type: "doctor",
        created_at: new Date(),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("Profile creation error:", profileError);
    }

    // Create doctor record
    const { error: doctorError } = await supabase.from("doctors").insert({
      id: authData.user.id,
      name,
      specialty,
      qualification,
      experience: experience || 0,
      created_at: new Date(),
    });

    if (doctorError) {
      console.error("Doctor creation error:", doctorError);
      return res
        .status(400)
        .json({ success: false, message: doctorError.message });
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
    return res.status(500).json({ success: false, message: "Server error" });
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
    let profileData;
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

// Update user location
router.post("/update-location", async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.body;
    
    console.log("Backend received location update request:", {
      userId, latitude, longitude
    });

    if (!userId || latitude === undefined || longitude === undefined) {
      console.error("Missing fields:", { userId, latitude, longitude });
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Validate that latitude and longitude are valid numbers
    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      console.error("Invalid coordinates:", { latitude, longitude });
      return res
        .status(400)
        .json({ success: false, message: "Invalid coordinates" });
    }

    console.log("Updating location in database for user:", userId);
    
    // Update the user's location in the patients table
    const { data, error } = await supabase
      .from("patients")
      .update({
        latitude: parsedLat,
        longitude: parsedLng,
        last_location_update: new Date(),
      })
      .eq("id", userId);

    if (error) {
      console.error("Supabase update error:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    // Verify the update was successful
    const { data: verifyData, error: verifyError } = await supabase
      .from("patients")
      .select("latitude, longitude, last_location_update")
      .eq("id", userId)
      .single();
    
    if (verifyError) {
      console.error("Verification query error:", verifyError);
    } else {
      console.log("Verification of update data:", verifyData);
    }

    return res.status(200).json({
      success: true,
      message: "Location updated successfully"
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
    
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // Get the user profile from the database
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (!data) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: data
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
