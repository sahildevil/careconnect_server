const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get user appointments
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from('appointments')
      .select('*, doctors(*)')
      .eq('user_id', userId);

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, appointments: data });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Book a new appointment
router.post('/', async (req, res) => {
  try {
    const { user_id, doctor_id, appointment_date, reason } = req.body;

    if (!user_id || !doctor_id || !appointment_date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id,
        doctor_id,
        appointment_date,
        reason,
        status: 'scheduled',
        created_at: new Date()
      })
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(201).json({ 
      success: true, 
      message: 'Appointment booked successfully',
      appointment: data[0]
    });
  } catch (error) {
    console.error('Error booking appointment:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Cancel appointment
router.put('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Appointment cancelled successfully',
      appointment: data[0]
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;