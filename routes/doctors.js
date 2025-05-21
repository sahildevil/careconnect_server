const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get all doctors
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*');

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, doctors: data });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get doctor by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, doctor: data });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;