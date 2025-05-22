const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");

// Get all doctors
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("doctors")
      .select("*")
      .eq("is_visible", true); // Only get doctors who have completed onboarding

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
      location_link,
      bio,
    } = req.body;

    if (
      !doctor_id ||
      !consultation_fee ||
      !available_days ||
      !available_hours
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Update the doctor record
    const { error: updateError } = await supabaseAdmin
      .from("doctors")
      .update({
        consultation_fee,
        available_days,
        available_hours,
        location_link: location_link || null,
        bio: bio || "",
        onboarding_complete: true,
        is_visible: true,
        updated_at: new Date(),
      })
      .eq("id", doctor_id);

    if (updateError) {
      console.error("Error updating doctor onboarding:", updateError);
      return res.status(400).json({
        success: false,
        message: updateError.message || "Failed to complete onboarding",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Onboarding completed successfully",
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add or update the onboarding status endpoint
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

module.exports = router;
