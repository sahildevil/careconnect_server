const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Register a new user
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json({ success: false, message: authError.message });
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name,
        email,
        created_at: new Date(),
      });

    if (profileError) {
      return res.status(400).json({ success: false, message: profileError.message });
    }

    return res.status(201).json({ 
      success: true, 
      message: 'User registered successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ success: false, message: error.message });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Login successful',
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout user
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Error logging out:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;