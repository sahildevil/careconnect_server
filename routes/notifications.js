const express = require("express");
const router = express.Router();
const { supabase, supabaseAdmin } = require("../config/supabase");
const admin = require("firebase-admin");

// Use environment variables instead of JSON file
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com",
};

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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

// Update the device registration endpoint to handle multiple users per device

router.post("/register-device", async (req, res) => {
  try {
    const { token, device_type } = req.body;
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(`[${requestId}] Device registration request:`, {
      token: token ? token.substring(0, 20) + '...' : 'null',
      device_type
    });

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
    console.log(`[${requestId}] Registering device for user: ${userId}`);

    // CRITICAL: Remove this token from ALL other users first
    const { error: cleanupError } = await supabaseAdmin
      .from("device_tokens")
      .delete()
      .eq("token", token)
      .neq("user_id", userId);

    if (cleanupError) {
      console.error(`[${requestId}] Error during token cleanup:`, cleanupError);
      // Continue anyway - this is not critical enough to fail the registration
    } else {
      console.log(`[${requestId}] Cleaned up token from other users`);
    }

    // Check if this token already exists for the current user
    const { data: existingToken, error: checkError } = await supabaseAdmin
      .from("device_tokens")
      .select("id, created_at")
      .eq("token", token)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) {
      console.error(`[${requestId}] Error checking existing token:`, checkError);
      return res
        .status(400)
        .json({ success: false, message: checkError.message });
    }

    if (existingToken) {
      // Token already exists for this user, just update the device_type
      const { data: updatedToken, error: updateError } = await supabaseAdmin
        .from("device_tokens")
        .update({ 
          device_type: device_type
        })
        .eq("id", existingToken.id)
        .select()
        .single();

      if (updateError) {
        console.error(`[${requestId}] Error updating existing token:`, updateError);
        return res.status(400).json({ 
          success: false, 
          message: updateError.message 
        });
      }

      console.log(`[${requestId}] Updated existing token for user ${userId}`);
      return res.status(200).json({
        success: true,
        message: "Device token updated successfully",
        device: updatedToken,
      });
    }

    // Register new token for this user (only use columns that exist in schema)
    const { data, error } = await supabaseAdmin
      .from("device_tokens")
      .insert({
        user_id: userId,
        token,
        device_type,
        // Remove created_at as it has a default value
        // Remove updated_at as it doesn't exist in the schema
      })
      .select()
      .single();

    if (error) {
      console.error(`[${requestId}] Error inserting new token:`, error);
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }

    console.log(`[${requestId}] Successfully registered new device token for user ${userId}`);

    return res.status(201).json({
      success: true,
      message: "Device registered successfully",
      device: data,
    });
  } catch (error) {
    console.error("Error registering device token:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/unregister-device", async (req, res) => {
  try {
    const { token } = req.body;
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(`[${requestId}] Device unregistration request for token: ${token ? token.substring(0, 20) + '...' : 'null'}`);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required",
      });
    }

    // Get user ID from authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // If no auth header, just try to delete the token anyway
      const { error } = await supabaseAdmin
        .from("device_tokens")
        .delete()
        .eq("token", token);

      if (error) {
        console.error(`[${requestId}] Error deleting token without auth:`, error);
        return res.status(400).json({ success: false, message: error.message });
      }

      console.log(`[${requestId}] Successfully deleted token without auth verification`);
      return res.status(200).json({
        success: true,
        message: "Device unregistered successfully",
      });
    }

    const authToken = authHeader.substring(7, authHeader.length);
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authToken
    );

    const userId = userData?.user?.id;

    // Delete the token (either for specific user or any user if auth failed)
    const deleteQuery = supabaseAdmin
      .from("device_tokens")
      .delete()
      .eq("token", token);

    if (userId) {
      deleteQuery.eq("user_id", userId);
      console.log(`[${requestId}] Deleting token for specific user: ${userId}`);
    } else {
      console.log(`[${requestId}] Deleting token for any user (auth failed)`);
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error(`[${requestId}] Error deleting device token:`, error);
      return res.status(400).json({ success: false, message: error.message });
    }

    console.log(`[${requestId}] Successfully unregistered device token`);

    return res.status(200).json({
      success: true,
      message: "Device unregistered successfully",
    });
  } catch (error) {
    console.error("Error unregistering device token:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create and send a notification function
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
        message: messageText,
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
            body: messageText,
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
