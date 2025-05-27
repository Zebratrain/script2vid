const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize Supabase client
const supabaseUrl = 'https://wnczujabypadhtsankif.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Video generation endpoint
app.post('/generate-video', async (req, res) => {
  try {
    console.log('=== RENDER SERVICE: VIDEO GENERATION STARTED ===');
    console.log('Request body:', {
      title: req.body.title,
      hasContent: !!req.body.content,
      voiceId: req.body.voiceId,
      userId: req.body.userId
    });

    const { title, content, voiceId, autoGenerateImages, userId } = req.body;

    if (!title || !content || !voiceId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, content, voiceId, userId'
      });
    }

    // Step 1: Create initial video record with processing status
    console.log('Creating initial video record...');
    const { data: initialVideo, error: createError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        title: title,
        status: 'processing',
        duration: '0:00',
        mp4_url: '',
        audio_url: '',
        subtitle_url: '',
        thumbnail_url: '',
        metadata: {
          estimatedDuration: Math.max(60, content.split(' ').length * 0.5),
          wordCount: content.split(' ').length
        }
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create video record: ${createError.message}`);
    }

    const videoId = initialVideo.id;
    console.log('Initial video record created:', videoId);

    // Step 2: Return immediate response with video ID
    res.json({
      success: true,
      videoData: {
        id: videoId,
        title: title,
        mp4Url: '',
        audioUrl: '',
        subtitleUrl: '',
        thumbnailUrl: '',
        duration: '0:00',
        status: 'processing',
        metadata: initialVideo.metadata
      }
    });

    // Step 3: Start background processing (don't await this)
    processVideoInBackground(videoId, { title, content, voiceId, autoGenerateImages, userId });

  } catch (error) {
    console.error('Error in video generation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Background video processing function
async function processVideoInBackground(videoId, { title, content, voiceId, autoGenerateImages, userId }) {
  try {
    console.log(`=== BACKGROUND PROCESSING STARTED FOR VIDEO ${videoId} ===`);

    // Step 1: Generate audio with ElevenLabs
    console.log('Step 1: Generating audio with ElevenLabs...');
    const audioFile = await generateAudioFile(content, voiceId);

    // Step 2: Generate images
    console.log('Step 2: Generating images...');
    const images = autoGenerateImages ? await generateImages(content) : await createDefaultImages();

    // Step 3: Generate subtitles
    console.log('Step 3: Generating subtitles...');
    const subtitleFile = await generateSubtitleFile(content);

    // Step 4: Compile video with FFmpeg
    console.log('Step 4: Compiling video...');
    const videoFile = await compileVideo(audioFile, images, videoId);

    // Step 5: Generate thumbnail
    console.log('Step 5: Generating thumbnail...');
    const thumbnailFile = await generateThumbnail(images[0]);

    // Step 6: Upload files to Supabase storage
    console.log('Step 6: Uploading files to Supabase storage...');
    const uploadedUrls = await uploadFilesToSupabase(videoId, userId, {
      videoFile,
      audioFile,
      subtitleFile,
      thumbnailFile
    });

    // Step 7: Get audio duration for final metadata
    const duration = await getAudioDuration(audioFile);

    // Step 8: Update video record with final URLs and completed status
    console.log('Step 8: Updating video record with final URLs...');
    const { error: updateError } = await supabase
      .from('videos')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration: formatDuration(duration),
        mp4_url: uploadedUrls.mp4Url,
        audio_url: uploadedUrls.audioUrl,
        subtitle_url: uploadedUrls.subtitleUrl,
        thumbnail_url: uploadedUrls.thumbnailUrl,
        metadata: {
          estimatedDuration: Math.round(duration),
          wordCount: content.split(' ').length,
          hasFFmpegProcessing: true,
          syncedSubtitles: true,
          imageCount: images.length
        }
      })
      .eq('id', videoId);

    if (updateError) {
      throw new Error(`Failed to update video record: ${updateError.message}`);
    }

    // Cleanup temp files
    cleanupTempFiles(videoId);

    console.log(`=== VIDEO ${videoId} PROCESSING COMPLETED SUCCESSFULLY ===`);

  } catch (error) {
    console.error(`Error in background processing for video ${videoId}:`, error);
    
    // Mark video as failed
    await supabase
      .from('videos')
      .update({
        status: 'failed',
        metadata: { error: error.message }
      })
      .eq('id', videoId);

    // Cleanup temp files even on error
    cleanupTempFiles(videoId);
  }
}

// Generate audio using ElevenLabs
async function generateAudioFile(content, voiceId) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: content,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        responseType: 'arraybuffer'
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error generating audio:', error);
    throw new Error(`Audio generation failed: ${error.message}`);
  }
}

// Generate images (placeholder - replace with your image generation logic)
async function generateImages(content) {
  // For now, create simple colored backgrounds with text
  const images = [];
  const sentences = content.split('.').filter(s => s.trim().length > 0);
  
  for (let i = 0; i < Math.min(sentences.length, 5); i++) {
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, `hsl(${i * 60}, 70%, 50%)`);
    gradient.addColorStop(1, `hsl(${i * 60 + 30}, 60%, 40%)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
    
    // Add text overlay
    ctx.fillStyle = 'white';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(sentences[i].trim().substring(0, 50) + '...', 960, 540);
    
    images.push(canvas.toBuffer('image/png'));
  }
  
  return images;
}

// Create default images if auto-generation is disabled
async function createDefaultImages() {
  const images = [];
  
  for (let i = 0; i < 3; i++) {
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');
    
    // Simple blue gradient
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, '#4F46E5');
    gradient.addColorStop(1, '#7C3AED');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
    
    images.push(canvas.toBuffer('image/png'));
  }
  
  return images;
}

// Generate subtitle file
async function generateSubtitleFile(content) {
  const words = content.split(' ');
  const wordsPerSecond = 2.5; // Adjust based on speech speed
  let srtContent = '';
  let subtitleIndex = 1;
  
  for (let i = 0; i < words.length; i += 10) {
    const chunk = words.slice(i, i + 10).join(' ');
    const startTime = i / wordsPerSecond;
    const endTime = Math.min((i + 10) / wordsPerSecond, words.length / wordsPerSecond);
    
    srtContent += `${subtitleIndex}\n`;
    srtContent += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
    srtContent += `${chunk}\n\n`;
    
    subtitleIndex++;
  }
  
  return Buffer.from(srtContent, 'utf-8');
}

// Compile video using FFmpeg
async function compileVideo(audioBuffer, images, videoId) {
  return new Promise((resolve, reject) => {
    const tempAudioPath = path.join(tempDir, `${videoId}_audio.mp3`);
    const tempVideoPath = path.join(tempDir, `${videoId}_video.mp4`);
    
    // Save audio to temp file
    fs.writeFileSync(tempAudioPath, audioBuffer);
    
    // Save images to temp files
    const imagePaths = images.map((imageBuffer, index) => {
      const imagePath = path.join(tempDir, `${videoId}_image_${index}.png`);
      fs.writeFileSync(imagePath, imageBuffer);
      return imagePath;
    });
    
    // Create video from images
    const command = ffmpeg();
    
    // Add images as input (loop each image for duration)
    imagePaths.forEach((imagePath, index) => {
      command.input(imagePath).loop(3); // Each image shows for 3 seconds
    });
    
    // Add audio
    command.input(tempAudioPath);
    
    // Set output options
    command
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-pix_fmt yuv420p',
        '-shortest'
      ])
      .output(tempVideoPath)
      .on('end', () => {
        const videoBuffer = fs.readFileSync(tempVideoPath);
        resolve(videoBuffer);
      })
      .on('error', (error) => {
        console.error('FFmpeg error:', error);
        reject(error);
      })
      .run();
  });
}

// Generate thumbnail from first image
async function generateThumbnail(firstImageBuffer) {
  try {
    const thumbnail = await sharp(firstImageBuffer)
      .resize(640, 360)
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return thumbnail;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw error;
  }
}

// Upload files to Supabase storage
async function uploadFilesToSupabase(videoId, userId, files) {
  const uploadedUrls = {};

  try {
    // Upload video file
    if (files.videoFile) {
      const videoPath = `${userId}/${videoId}/video.mp4`;
      const { error: videoError } = await supabase.storage
        .from('videos')
        .upload(videoPath, files.videoFile, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (videoError) throw new Error(`Video upload failed: ${videoError.message}`);
      
      const { data: videoUrl } = supabase.storage
        .from('videos')
        .getPublicUrl(videoPath);
      
      uploadedUrls.mp4Url = videoUrl.publicUrl;
      console.log('Video uploaded successfully:', uploadedUrls.mp4Url);
    }

    // Upload audio file
    if (files.audioFile) {
      const audioPath = `${userId}/${videoId}/audio.mp3`;
      const { error: audioError } = await supabase.storage
        .from('audio')
        .upload(audioPath, files.audioFile, {
          contentType: 'audio/mpeg',
          upsert: true
        });

      if (audioError) throw new Error(`Audio upload failed: ${audioError.message}`);
      
      const { data: audioUrl } = supabase.storage
        .from('audio')
        .getPublicUrl(audioPath);
      
      uploadedUrls.audioUrl = audioUrl.publicUrl;
      console.log('Audio uploaded successfully:', uploadedUrls.audioUrl);
    }

    // Upload subtitle file
    if (files.subtitleFile) {
      const subtitlePath = `${userId}/${videoId}/subtitles.srt`;
      const { error: subtitleError } = await supabase.storage
        .from('subtitles')
        .upload(subtitlePath, files.subtitleFile, {
          contentType: 'text/plain',
          upsert: true
        });

      if (subtitleError) throw new Error(`Subtitle upload failed: ${subtitleError.message}`);
      
      const { data: subtitleUrl } = supabase.storage
        .from('subtitles')
        .getPublicUrl(subtitlePath);
      
      uploadedUrls.subtitleUrl = subtitleUrl.publicUrl;
      console.log('Subtitles uploaded successfully:', uploadedUrls.subtitleUrl);
    }

    // Upload thumbnail file
    if (files.thumbnailFile) {
      const thumbnailPath = `${userId}/${videoId}/thumbnail.jpg`;
      const { error: thumbnailError } = await supabase.storage
        .from('thumbnails')
        .upload(thumbnailPath, files.thumbnailFile, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (thumbnailError) throw new Error(`Thumbnail upload failed: ${thumbnailError.message}`);
      
      const { data: thumbnailUrl } = supabase.storage
        .from('thumbnails')
        .getPublicUrl(thumbnailPath);
      
      uploadedUrls.thumbnailUrl = thumbnailUrl.publicUrl;
      console.log('Thumbnail uploaded successfully:', uploadedUrls.thumbnailUrl);
    }

    return uploadedUrls;

  } catch (error) {
    console.error('Error uploading files to Supabase:', error);
    throw error;
  }
}

// Utility functions
function formatSRTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getAudioDuration(audioBuffer) {
  return new Promise((resolve) => {
    const tempPath = path.join(tempDir, 'temp_audio_duration.mp3');
    fs.writeFileSync(tempPath, audioBuffer);
    
    ffmpeg.ffprobe(tempPath, (err, metadata) => {
      if (err) {
        console.error('Error getting audio duration:', err);
        resolve(120); // Default to 2 minutes
      } else {
        resolve(metadata.format.duration || 120);
      }
      
      // Cleanup
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    });
  });
}

function cleanupTempFiles(videoId) {
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      if (file.includes(videoId)) {
        const filePath = path.join(tempDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
    console.log(`Temp files cleaned up for video ${videoId}`);
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status check endpoint
app.get('/status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const { data: video, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (error || !video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found'
      });
    }

    res.json({
      success: true,
      videoData: {
        id: video.id,
        title: video.title,
        mp4Url: video.mp4_url || '',
        audioUrl: video.audio_url || '',
        subtitleUrl: video.subtitle_url || '',
        thumbnailUrl: video.thumbnail_url || '',
        duration: video.duration || '0:00',
        status: video.status,
        metadata: video.metadata || {}
      }
    });

  } catch (error) {
    console.error('Error checking video status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`=== RENDER SERVICE STARTED ON PORT ${PORT} ===`);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Service ready for video generation requests');
});
