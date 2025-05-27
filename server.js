const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Your Render service endpoint
app.post('/generate-video', async (req, res) => {
  try {
    console.log('Received video generation request:', req.body);
    
    // 1. Extract data from request
    const { title, content, voiceId, autoGenerateImages, userId } = req.body;
    
    // Validate required fields
    if (!title || !content || !voiceId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, content, voiceId, and userId are required'
      });
    }
    
    // 2. Your existing video processing logic here
    // (FFmpeg, image generation, audio synthesis, etc.)
    console.log('Starting video processing...');
    const processedVideoData = await processVideo({
      title,
      content,
      voiceId,
      autoGenerateImages
    });
    
    console.log('Video processing completed, calling Supabase...');
    
    // 3. Call Supabase Edge Function to save to database
    const supabaseResponse = await fetch('https://wnczujabypadhtsankif.supabase.co/functions/v1/generate-video', {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization, // Pass through auth token
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduY3p1amFieXBhZGh0c2Fua2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyNzI4NTEsImV4cCI6MjA2Mzg0ODg1MX0.gQNqJkyk4ov5ocQVxCS4AblC4JRCz44-RVs_mDy4zH4'
      },
      body: JSON.stringify({
        // Pass ALL original script data to Supabase
        title,
        content,
        voiceId,
        autoGenerateImages,
        // Plus the processed video URLs
        mp4Url: processedVideoData.mp4Url,
        audioUrl: processedVideoData.audioUrl,
        subtitleUrl: processedVideoData.subtitleUrl,
        thumbnailUrl: processedVideoData.thumbnailUrl,
        duration: processedVideoData.duration,
        status: 'completed',
        metadata: processedVideoData.metadata
      })
    });
    
    console.log('Supabase response status:', supabaseResponse.status);
    
    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      console.error('Supabase error response:', errorText);
      throw new Error(`Supabase call failed: ${supabaseResponse.status} - ${errorText}`);
    }
    
    const supabaseResult = await supabaseResponse.json();
    console.log('Supabase success response:', supabaseResult);
    
    // 4. Return success response to frontend
    res.json({
      success: true,
      videoData: supabaseResult.videoData
    });
    
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Your existing video processing function
async function processVideo({ title, content, voiceId, autoGenerateImages }) {
  try {
    console.log(`Processing video: ${title}`);
    console.log(`Voice ID: ${voiceId}`);
    console.log(`Auto generate images: ${autoGenerateImages}`);
    console.log(`Content length: ${content.length} characters`);
    
    // Your FFmpeg and processing logic here
    // This is where you put your existing video generation code
    
    // For now, returning mock data - replace with your actual processing
    const duration = Math.ceil(content.split(' ').length / 150 * 60); // Estimate duration
    
    // Replace these with your actual file upload URLs
    return {
      mp4Url: 'https://your-storage/video.mp4',
      audioUrl: 'https://your-storage/audio.mp3',
      subtitleUrl: 'https://your-storage/subtitles.srt',
      thumbnailUrl: 'https://your-storage/thumbnail.jpg',
      duration: `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')}`,
      metadata: {
        hasFFmpegProcessing: true,
        imageCount: autoGenerateImages ? 5 : 1,
        wordCount: content.split(' ').length,
        estimatedDuration: duration,
        syncedSubtitles: true
      }
    };
  } catch (error) {
    console.error('Video processing error:', error);
    throw new Error(`Video processing failed: ${error.message}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
