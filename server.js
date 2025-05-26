const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Video generation endpoint
app.post('/generate-video', async (req, res) => {
  try {
    const { title, content, voiceId, autoGenerateImages, userId } = req.body;
    
    console.log('Starting video generation for:', title);
    
    // Your video generation logic here
    // (We'll implement this in the next step)
    
    res.json({ success: true, message: 'Video generation started' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
