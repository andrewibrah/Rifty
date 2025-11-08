// Quick test script for edge function diagnostics
// Run with: node test_edge_function.js

const https = require("https");

// Get these from your .env file
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://ajqcprzxaywgdtsveewq.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

if (!SUPABASE_ANON_KEY) {
  console.error("Set EXPO_PUBLIC_SUPABASE_ANON_KEY environment variable");
  process.exit(1);
}

// First, get a user token (you'll need to log in first)
console.log("Testing edge function diagnostics...\n");
console.log(
  "Note: You need to be logged in. If this fails with 401, log into your app first.\n"
);

const url = `${SUPABASE_URL}/functions/v1/test_operating_picture`;

const data = JSON.stringify({});

const options = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  },
};

const req = https.request(url, options, (res) => {
  let body = "";

  res.on("data", (chunk) => {
    body += chunk;
  });

  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("\nResponse:");
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(body);
    }
  });
});

req.on("error", (error) => {
  console.error("Error:", error);
});

req.write(data);
req.end();
