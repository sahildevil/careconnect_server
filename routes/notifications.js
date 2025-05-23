const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");
const admin = require("firebase-admin");

const serviceAccount = require("../firebase-service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Get all notifications for current user
router.get("/", async (req, res) => {
  try {
    // Get user ID from token
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

    // Get notifications for this user, ordered by creation date (newest first)
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, notifications: data });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark a notification as read
router.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user owns the notification
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

    // Update the notification
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: data[0],
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark all notifications as read
router.put("/mark-all-read", async (req, res) => {
  try {
    // Get user ID from token
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

    // Update all unread notifications for this user
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      count: data.length,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Register device token for push notifications
router.post("/register-device", async (req, res) => {
  try {
    const { token, device_type } = req.body;

    if (!token || !device_type) {
      return res.status(400).json({
        success: false,
        message: "Token and device type are required",
      });
    }

    // Get user ID from authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const authToken = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authToken
    );

    if (userError || !userData.user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const userId = userData.user.id;

    // Check if this token already exists for this user
    const { data: existingToken, error: checkError } = await supabase
      .from("device_tokens")
      .select("id")
      .eq("token", token)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) {
      return res
        .status(400)
        .json({ success: false, message: checkError.message });
    }

    if (existingToken) {
      // Token already registered, return success
      return res.status(200).json({
        success: true,
        message: "Device token already registered",
      });
    }

    // Register new token
    const { data, error } = await supabaseAdmin
      .from("device_tokens")
      .insert({
        user_id: userId,
        token,
        device_type,
      })
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(201).json({
      success: true,
      message: "Device registered successfully",
      device: data[0],
    });
  } catch (error) {
    console.error("Error registering device token:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create and send a notification
async function sendNotification(
  userId,
  title,
  messageText,
  notificationType,
  relatedId = null
) {
  try {
    // First, create the notification in the database
    const { data: notification, error: dbError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: userId,
        title,
        message: messageText, // Use messageText parameter
        notification_type: notificationType,
        related_id: relatedId,
        is_read: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error creating notification in database:", dbError);
      return { success: false, error: dbError.message };
    }

    // Next, get all device tokens for this user
    const { data: deviceTokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, device_type")
      .eq("user_id", userId);

    if (tokenError) {
      console.error("Error fetching device tokens:", tokenError);
      return {
        success: false,
        notification,
        error: tokenError.message,
      };
    }

    // If no device tokens, still return success with the notification
    if (!deviceTokens || deviceTokens.length === 0) {
      return {
        success: true,
        notification,
        message: "Notification created but no devices registered",
      };
    }

    // Send push notification to each device
    const sendPromises = deviceTokens.map(async (device) => {
      try {
        // Create the Firebase message object with a different variable name
        const firebaseMessage = {
          token: device.token,
          notification: {
            title: title,
            body: messageText, // Use messageText instead of message
          },
          data: {
            type: notificationType,
            relatedId: relatedId ? relatedId.toString() : "",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
          },
          android: {
            priority: "high",
          },
          apns: {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                sound: "default",
              },
            },
          },
        };

        await admin.messaging().send(firebaseMessage);
        console.log(
          `Notification sent successfully to device: ${device.token.substring(
            0,
            20
          )}...`
        );
        return { success: true, device: device.token };
      } catch (error) {
        console.error(
          `Error sending to device ${device.token.substring(0, 20)}...:`,
          error
        );
        return { success: false, device: device.token, error: error.message };
      }
    });

    const results = await Promise.all(sendPromises);

    // Log results
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    console.log(
      `Notification delivery: ${successCount} successful, ${failureCount} failed`
    );

    return {
      success: true,
      notification,
      deliveryResults: results,
      stats: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
      },
    };
  } catch (error) {
    console.error("Error in sendNotification:", error);
    return { success: false, error: error.message };
  }
}

// Export the router and the notification function
module.exports = {
  router,
  sendNotification,
};
