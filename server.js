require('dotenv').config();

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const https = require("https");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");

// Create a custom HTTPS agent for internal API calls only
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Only for internal Mulesoft API
});

const app = express();

// Add body parsing middleware BEFORE multer configuration
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: '*' })); // Allow all origins

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

// Store the base domain separately
const BASE_DOMAIN = process.env.BASE_DOMAIN;
//const BASE_DOMAIN = "https://localhost:443/eip-sc-wiki-content-generate-api/v1";
// Define paths
const WIKI_GENERATE_PATH = "/wikigenerate";
const GITORGS_PATH = "/mulesoftorgs";
const WIKI_SPACE_KEYS_PATH = "/wikispace"; // Assuming this is the path for wiki space keys

// Endpoint to call Mulesoft API and generate Confluence page with file attachments
app.post("/generate-confluence", upload.any(), async (req, res) => {
  console.log("=== INCOMING REQUEST ===");
  // console.log("Request body:", JSON.stringify(req.body, null, 2));
   console.log("Body:", req.body);
  console.log("Uploaded files:", req.files?.map(file => ({
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path
  })));

  try {
    // Check if req.body exists first
    if (!req.body || typeof req.body !== 'object') {
      console.error("ERROR: req.body is undefined, null, or not an object!");
      console.error("Content-Type:", req.headers['content-type']);
      console.error("Body received:", req.body);
      
      return res.status(400).json({
        status: "error",
        message: "Request body is missing or malformed. Make sure you're sending form data correctly.",
        debug: {
          bodyType: typeof req.body,
          bodyValue: req.body,
          contentType: req.headers['content-type'],
          filesReceived: req.files?.length || 0,
          expectedContentType: "multipart/form-data"
        }
      });
    }

    // Extract and validate all form fields - SAFE destructuring with fallback
    const {
      apiType,
      fetchPropertyFile,
      selectedGitOrg,
      wikiSpaceKey,
      pageToBeCreatedTitle,
      pageToBeCreatedParentPageTitle,
      appName,
      l0ProductionSupport,
      l0ProductionSupportEmail,
      l2MulesoftSupport,
      l2MulesoftSupportEmail,
      integrationDevTeam,
      integrationDevTeamEmail,
      businessTeam,
      businessTeamEmail,
      hasFiles
    } = req.body || {}; // Add fallback empty object

    // Optional: Add validation for required fields if needed
    if (!pageToBeCreatedTitle) {
      return res.status(400).json({
        status: "error",
        message: "pageToBeCreatedTitle is required"
      });
    }

    if (!wikiSpaceKey) {
      return res.status(400).json({
        status: "error",
        message: "wikiSpaceKey is required"
      });
    }

    // Log all received data (will show actual values or undefined)
    console.log("=== PARSED FORM DATA ===");
    console.log("Form data:", {
      apiType,
      fetchPropertyFile,
      selectedGitOrg,
      wikiSpaceKey,
      pageToBeCreatedTitle,
      pageToBeCreatedParentPageTitle,
      appName,
      contactInfo: {
        l0ProductionSupport,
        l0ProductionSupportEmail,
        l2MulesoftSupport,
        l2MulesoftSupportEmail,
        integrationDevTeam,
        integrationDevTeamEmail,
        businessTeam,
        businessTeamEmail
      },
      hasFiles,
      filesCount: {
        total: req.files?.length || 0,
        tdd: req.files?.filter(f => f.fieldname === 'tddIrdFiles').length || 0,
        postman: req.files?.filter(f => f.fieldname === 'postmanFiles').length || 0,
        comm: req.files?.filter(f => f.fieldname === 'commFiles').length || 0
      }
    });

    // Create FormData to send multipart data
    const formData = new FormData();
    
    // Prepare complete data object for Mulesoft API
    const pageData = {
      apiType,
      fetchPropertyFile,
      selectedGitOrg,
      wikiSpaceKey,
      pageToBeCreatedTitle,
      pageToBeCreatedParentPageTitle,
      appName,
      l0ProductionSupport,
      l0ProductionSupportEmail,
      l2MulesoftSupport,
      l2MulesoftSupportEmail,
      integrationDevTeam,
      integrationDevTeamEmail,
      businessTeam,
      businessTeamEmail,
      hasFiles: req.files && req.files.length > 0
    };

    console.log("=== PAGE DATA BEING SENT TO MULESOFT ===");
    console.log(JSON.stringify(pageData, null, 2));
    
    formData.append('data', JSON.stringify(pageData));
    
    // Add files organized by category (if any)
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
      console.log("=== NO FILES ATTACHED - PROCESSING TEXT-ONLY REQUEST ===");
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
        httpsAgent: httpsAgent,
        timeout: 300000 // 5 minute timeout for large files
      }
    );

    console.log("=== MULESOFT RESPONSE ===");
    console.log("Status:", response.status);
    console.log("Data:", response.data);

    // Extract page URL from Mulesoft response - updated to match actual response format
    const pageUrl = response.data?.pageURL ||           // Actual field from Mulesoft (note: pageURL not pageUrl)
                   response.data?.pageUrl || 
                   response.data?.confluencePageUrl || 
                   response.data?.url ||
                   `https://wiki.intel.com/display/${wikiSpaceKey}/${pageToBeCreatedTitle?.replace(/\s+/g, '+')}`;

    console.log("Extracted Page URL:", pageUrl);
    // Clean up uploaded files after successful sending
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Cleaned up file: ${file.originalname}`);
        } catch (cleanupError) {
          console.error(`Error cleaning up file ${file.originalname}:`, cleanupError.message);
        }
      });
    }

    // Return simple response with just success message and page URL
    res.status(200).json({
      message: "Confluence page generated successfully",
      pageUrl: pageUrl
    });

  } catch (error) {
    console.error("=== ERROR CALLING MULESOFT API ===");
    console.error("Error message:", error.message);
    
    // Clean up uploaded files in case of error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Cleaned up file after error: ${file.originalname}`);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError.message);
        }
      });
    }
    
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
      
      res.status(error.response.status).json({ 
        status: "error",
        error: "Mulesoft API error",
        details: error.response.data,
        message: error.message
      });
    } else if (error.request) {
      console.error("No response received:", error.request);
      res.status(500).json({ 
        status: "error",
        error: "No response from Mulesoft API",
        message: "Network or timeout error"
      });
    } else {
      console.error("Error setting up request:", error.message);
      res.status(500).json({ 
        status: "error",
        error: "Failed to generate Confluence page",
        message: error.message
      });
    }
  }
});

// call org endpoint to get Mulesoft orgs
app.get("/gitorgs", async (req, res) => {
  try {
    const response = await axios.get(`${BASE_DOMAIN}${GITORGS_PATH}`, {
      httpsAgent: httpsAgent // Add httpsAgent here too
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//get wiki space keys list
app.get('/wikispacekeys', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_DOMAIN}${WIKI_SPACE_KEYS_PATH}`, {
      httpsAgent: httpsAgent // Add httpsAgent here too
    });
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
