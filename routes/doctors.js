const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");
const multer = require('multer');
const path = require('path');

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
  fileFilter: (req, file, callback) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return callback(null, true);
    }
    callback(new Error('Only image files are allowed!'));
  }
});

// Get all doctors
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("doctors")
      .select("*")
      .eq("is_visible", true); // Sahil - Doctors who have completed onboarding

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, doctors: data });
  } catch (error) {
    console.error("Error fetching doctors:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get doctor by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("doctors")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, doctor: data });
  } catch (error) {
    console.error("Error fetching doctor:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Complete doctor onboarding
router.post("/complete-onboarding", async (req, res) => {
  try {
    const {
      doctor_id,
      consultation_fee,
      available_days,
      available_hours,
      bio,
      location_link,
      latitude,
      longitude,
    } = req.body;

    if (!doctor_id) {
      return res
        .status(400)
        .json({ success: false, message: "Doctor ID is required" });
    }

    // Update the doctor record with the onboarding data
    const { data, error } = await supabaseAdmin
      .from("doctors")
      .update({
        consultation_fee,
        available_days,
        available_hours,
        bio: bio || null,
        location_link: location_link || null,
        latitude: latitude || null,
        longitude: longitude || null,
        onboarding_complete: true,
        is_visible: true,
        updated_at: new Date(),
      })
      .eq("id", doctor_id)
      .select();

    if (error) {
      console.error("Error updating doctor onboarding:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Onboarding completed successfully",
      doctor: data[0],
    });
  } catch (error) {
    console.error("Error in complete-onboarding:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const doctorId = req.user?.id;
    
    if (!doctorId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    const {
      name,
      phone_number,
      specialty,
      bio,
      consultation_fee,
      qualification,
      available_hours,
    } = req.body;

    // Update the doctor record
    const { data, error } = await supabaseAdmin
      .from("doctors")
      .update({
        name,
        phone_number,
        specialty,
        bio,
        consultation_fee,
        qualification,
        available_hours,
        updated_at: new Date(),
      })
      .eq("id", doctorId)
      .select();

    if (error) {
      console.error("Error updating doctor profile:", error);
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      doctor: data[0],
    });
  } catch (error) {
    console.error("Error updating doctor profile:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/onboarding-status/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get the doctor record
    const { data, error } = await supabase
      .from("doctors")
      .select("onboarding_complete, is_visible")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error checking onboarding status:", error);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // If we couldn't find the doctor record or onboarding_complete is false, they need onboarding
    const needsOnboarding = !data || data.onboarding_complete === false;

    return res.status(200).json({
      success: true,
      onboarding_complete: !needsOnboarding,
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Add the endpoint for profile picture upload
router.post('/upload-profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    // Extract doctor ID from token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const doctorId = userData.user.id;
    
    // Check if the user is a doctor
    const { data: doctorData, error: doctorError } = await supabase
      .from("doctors")
      .select("id")
      .eq("id", doctorId)
      .single();
    
    if (doctorError || !doctorData) {
      return res.status(403).json({ success: false, message: "User is not a doctor" });
    }
    
    // Check if file exists in request
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }
    
    // Upload to Supabase Storage
    const fileName = `doctor_${doctorId}_${Date.now()}${path.extname(req.file.originalname)}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });
    
    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(400).json({ success: false, message: "Failed to upload image" });
    }
    
    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(fileName);
    
    const avatarUrl = publicUrlData.publicUrl;
    
    // Update the doctor record with the new avatar URL
    const { data, error } = await supabaseAdmin
      .from("doctors")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date()
      })
      .eq("id", doctorId)
      .select();
    
    if (error) {
      console.error("Error updating doctor profile:", error);
      return res.status(400).json({ success: false, message: error.message });
    }
    
    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded successfully",
      avatar_url: avatarUrl,
      doctor: data[0]
    });
    
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
