const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const jsQR = require('jsqr');
const sharp = require('sharp');
const cors = require('cors');
const { createCanvas, loadImage } = require('canvas');


const app = express();
const upload = multer({ dest: 'uploads/' });

const port = process.env.PORT || 3000;
const serverURL = `http://192.168.43.223:${port}`;



// Enable CORS for all routes
app.use(cors());

// Serve static files from the 'frames' directory
app.use('/frames', express.static(path.join(__dirname, 'frames')));






// Handle video uploads
app.post('/upload-video', upload.single('video'), async (req, res) => {
  const videoPath = req.file.path;
  const videoName = req.file.filename;
  const { scanType } = req.body;   // Extract scanType from the request body
  const outputDir = path.join(__dirname, 'frames', videoName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Extract frames using FFmpeg
  exec(`ffmpeg -i ${videoPath} -vf "fps=2" ${outputDir}/frame_%04d.png`, async (err) => {
    if (err) {
      return res.status(500).send(`Error extracting frames: ${err.message}`);
    }

    // Get the list of extracted frames
    const frameFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.png'));
    const frames = frameFiles.map(file => path.join(outputDir, file));

    // Process frames and get the first 3 relevant frames
    const results = await processFrames(frames);
    const firstThreeFrames = frames.slice(0, 5).map(frame => `${serverURL}/frames/${videoName}/${path.basename(frame)}`);
    
    // Return the frame URIs and extracted data
    res.status(200).json({
      firstThreeFrames,
      productData: {
        productName: "Product Name",
        productPrice: "Product Price",
        productManufacturer: "Product Manufacturer",
        productExpriryDate: "Product Expiry Date",
        productDateManufactured: "Product Date Manufactured",
        productCountryOfOrigin: "Product Country Of Origin",
        productDescription: "Product Description",
      },
      // barcodeData: "",
      // ocrData: "",
      // qrCodeData: ""
    });
  });
});







// Handle image uploads
app.post('/upload-image', upload.single('image'), async (req, res) => {
  const imagePath = req.file.path;
  const { scanType } = req.body;
  console.log(scanType);

  
  // const barcodeData = await runScan(scanBarcode, imagePath);
  // const ocrData = await runScan(scanOCR, imagePath);
  // const qrCodeData = await runScan(scanQRCode, imagePath);


  // Return the image URI and product data
  res.status(200).json({
    image: `${serverURL}/${imagePath}`,
    productData: {
      productName: "Product Name",
      productPrice: "Product Price",
      productManufacturer: "Product Manufacturer",
      productExpriryDate: "Product Expiry Date",
      productDateManufactured: "Product Date Manufactured",
      productCountryOfOrigin: "Product Country Of Origin",
      productDescription: "Product Description",
    },
    // barcodeData,
    // ocrData,
    // qrCodeData
  });
});
















const processFrames = async (frames) => {
  const results = [];
  for (const frame of frames) {
    const frameData = fs.readFileSync(frame);
    const barcodeData = await scanBarcode(frame);
    const ocrData = await scanOCR(frame);
    const qrCodeData = await scanQRCode(frame);

    if (barcodeData || ocrData || qrCodeData) {
      results.push({ frame, barcodeData, ocrData, qrCodeData });
      if (results.length === 3) break; // Stop after finding 3 relevant frames
    }
  }
  return results;
};




const scanBarcode = async (input) => {
  let frameBuffer;

  // Check if input is a file path or a buffer
  if (typeof input === 'string') {
    // Read file from the path
    frameBuffer = fs.readFileSync(input);
  } else if (Buffer.isBuffer(input)) {
    // Use the buffer directly
    frameBuffer = input;
  } else {
    throw new Error('Invalid input type');
  }

  const { data, info } = await sharp(frameBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return code ? code.data : "";
};


const scanOCR = async (input) => {
  let image;

  // Check if input is a file path or a buffer
  if (typeof input === 'string') {
    // Use the path directly
    image = input;
  } else if (Buffer.isBuffer(input)) {
    // Create a buffer stream for Tesseract
    image = Buffer.from(input);
  } else {
    throw new Error('Invalid input type');
  }

  const { data: { text } } = await Tesseract.recognize(image, 'eng');
  return text.trim();
};



async function scanQRCode(input) {
  return new Promise((resolve, reject) => {
    let imagePath;

    // Check if input is a file path or a buffer
    if (typeof input === 'string') {
      // Use the file path directly
      imagePath = input;
    } else if (Buffer.isBuffer(input)) {
      // Use the buffer directly
      // Temporarily save the buffer to a file to load it with loadImage
      const tempFilePath = './tempImage.png';
      fs.writeFileSync(tempFilePath, input);
      imagePath = tempFilePath;
    } else {
      return reject(new Error('Invalid input type'));
    }

    console.log("\n\n\n", imagePath);

    loadImage(imagePath).then((image) => {
      try {
        // Create a canvas element to draw the image
        const canvas = createCanvas(image.width, image.height);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);

        // Extract image data from the canvas
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Use jsQR to decode the QR code
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          resolve(code.data); // Return the decoded text
        } else {
          resolve('No QR code found');
        }
      } catch (error) {
        reject(error); // Handle any errors
      } finally {
        // Clean up temporary file if used
        if (fs.existsSync('./tempImage.png')) {
          fs.unlinkSync('./tempImage.png');
        }
      }
    }).catch(error => {
      reject(error); // Handle any errors loading the image
    });
  });
}


async function runScan(functionToRun, parameterToUse){
  try {
    const result = await functionToRun(parameterToUse) ;
    console.log('\n\nResult:', result);
    return result;
  } catch (error) {
    console.error('Error:', error);
  }
  return "";
}




app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
