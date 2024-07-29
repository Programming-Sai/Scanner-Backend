const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { v4: uuidv4 } = require('uuid');
const Jimp = require('jimp'); // Add this to handle image resizing

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

app.post('/upload', upload.single('video'), async (req, res) => {
    const videoPath = req.file.path;
    const framesDir = path.join(__dirname, 'frames', uuidv4());

    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }

    try {
        await extractFrames(videoPath, framesDir);
        const uniqueFrames = await processFrames(framesDir);
        const ocrResults = await performOCR(uniqueFrames);

        res.json(ocrResults);
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        fs.unlinkSync(videoPath);
        fs.rmSync(framesDir, { recursive: true, force: true });
    }
});

const extractFrames = (videoPath, framesDir) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .on('start', (commandLine) => {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
            })
            .on('end', () => {
                console.log('Processing finished.');
                resolve();
            })
            .on('error', (err) => {
                console.error('Error extracting frames:', err.message);
                reject(err);
            })
            .on('progress', (progress) => {
                console.log(`Processing: ${progress.percent}% done`);
            })
            .output(`${framesDir}/frame-%04d.png`)
            .run();
    });
};


const processFrames = async (framesDir) => {
    // Implement frame similarity and unique frame detection logic here.
    // This is a placeholder for the example.
    const frameFiles = fs.readdirSync(framesDir).map(file => path.join(framesDir, file));
    return frameFiles; // For now, return all frames as unique.
};


const performOCR = async (frames) => {
    const ocrResults = [];
    for (const frame of frames) {
        try {
            const { data: { text } } = await Tesseract.recognize(frame, 'eng');
            ocrResults.push({ frame, text });
        } catch (error) {
            console.log(`Error processing frame ${frame}:`, error.message);
        }
    }
    return ocrResults;
};
const retryReadImage = async (frame, retries) => {
    for (let i = 0; i < retries; i++) {
        try {
            const image = await Jimp.read(frame);
            return image;
        } catch (error) {
            console.log(`Error reading frame ${frame}, retry ${i + 1}/${retries}: ${error.message}`);
        }
    }
    return null;
};

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)})