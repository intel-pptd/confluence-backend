require('dotenv').config();

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const https = require("https");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept files with specific field names
    const allowedFields = ['tddIrdFiles', 'postmanFiles', 'commFiles', 'files'];
    if (allowedFields.includes(file.fieldname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unexpected field: ${file.fieldname}`), false);
    }
  }
});

app.use(cors({ origin: '*' })); // Allow all origins

// Store the base domain separately
// const BASE_DOMAIN = "https://sc-test-17-dev.ipaas.intel.com/eip-sc-wiki-content-generate-api/v1";
const BASE_DOMAIN = process.env.BASE_DOMAIN;
// Define paths
const WIKI_GENERATE_PATH = "/wikigenerate";
const GITORGS_PATH = "/mulesoftorgs";
const WIKI_SPACE_KEYS_PATH = "/wikispace"; // Assuming this is the path for wiki space keys

// Endpoint to call Mulesoft API and generate Confluence page with file attachments
app.post("/generate-confluence", upload.any(), async (req, res) => {
  console.log("=== INCOMING REQUEST ===");
  console.log("Request body:", JSON.stringify(req.body, null, 2));
  console.log("Uploaded files:", req.files?.map(file => ({
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path
  })));

  try {
    // Create FormData to send multipart data
    const formData = new FormData();
    
    // Add the JSON data
    const pageData = req.body;
    console.log("=== PAGE DATA BEING SENT ===");
    console.log(JSON.stringify(pageData, null, 2));
    
    formData.append('data', JSON.stringify(pageData));
    
    // Add files organized by category
    if (req.files && req.files.length > 0) {
      console.log("=== FILES BEING ATTACHED ===");
      
      // Separate files by category
      const tddIrdFiles = req.files.filter(file => file.fieldname === 'tddIrdFiles');
      const postmanFiles = req.files.filter(file => file.fieldname === 'postmanFiles');
      const commFiles = req.files.filter(file => file.fieldname === 'commFiles');
      const generalFiles = req.files.filter(file => file.fieldname === 'files');
      
      // Add TDD/IRD files
      if (tddIrdFiles.length > 0) {
        console.log("TDD/IRD Files:");
        tddIrdFiles.forEach((file, index) => {
          console.log(`  TDD/IRD File ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          });
          formData.append('tddIrdFiles', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
          });
        });
      }
      
      // Add Postman files
      if (postmanFiles.length > 0) {
        console.log("Postman Files:");
        postmanFiles.forEach((file, index) => {
          console.log(`  Postman File ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          });
          formData.append('postmanFiles', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
          });
        });
      }
      
      // Add Communication files
      if (commFiles.length > 0) {
        console.log("Communication Files:");
        commFiles.forEach((file, index) => {
          console.log(`  Communication File ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          });
          formData.append('commFiles', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
          });
        });
      }
      
      // Add general files (for backward compatibility)
      if (generalFiles.length > 0) {
        console.log("General Files:");
        generalFiles.forEach((file, index) => {
          console.log(`  General File ${index + 1}:`, {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          });
          formData.append('files', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
          });
        });
      }
    } else {
      console.log("=== NO FILES ATTACHED ===");
    }

    console.log("=== SENDING REQUEST TO MULESOFT ===");
    console.log("URL:", `${BASE_DOMAIN}${WIKI_GENERATE_PATH}`);
    console.log("Headers:", formData.getHeaders());

    const response = await axios.post(
      `${BASE_DOMAIN}${WIKI_GENERATE_PATH}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    // Clean up uploaded files after sending
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
    }

    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error calling Mulesoft API:", error.message);
    
    // Clean up uploaded files in case of error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError.message);
        }
      });
    }
    
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }
    res.status(500).json({ error: "Failed to generate Confluence page" });
  }
});

// call org endpoint to get Mulesoft orgs
app.get("/gitorgs", async (req, res) => {
  try {
    const response = await axios.get(`${BASE_DOMAIN}${GITORGS_PATH}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//get wiki space keys list
app.get('/wikispacekeys', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_DOMAIN}${WIKI_SPACE_KEYS_PATH}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to show request structure
app.post("/test-request", upload.any(), async (req, res) => {
  console.log("=== TEST REQUEST STRUCTURE ===");
  
  const requestStructure = {
    method: 'POST',
    url: req.url,
    headers: req.headers,
    body: req.body,
    files: req.files?.map(file => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })),
    forwardedTo: `${BASE_DOMAIN}${WIKI_GENERATE_PATH}`,
    requestType: 'multipart/form-data'
  };
  
  console.log(JSON.stringify(requestStructure, null, 2));
  res.json(requestStructure);
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});