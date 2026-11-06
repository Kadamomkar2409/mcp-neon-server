import { signToken } from "../src/middleware/auth.js";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const userId = process.argv[2] || randomUUID();
const email = process.argv[3] || "chatgpt-user@example.com";
const name = process.argv[4] || "ChatGPT Tester";

const token = signToken({
  userId,
  email,
  name,
}, "30d");

console.log("================================================================================");
console.log("  MCP SERVER - JWT ACCESS TOKEN GENERATOR FOR CHATGPT & TESTING");
console.log("================================================================================");
console.log(`User ID : ${userId}`);
console.log(`Email   : ${email}`);
console.log(`Name    : ${name}`);
console.log(`Expires : 30 days`);
console.log("--------------------------------------------------------------------------------");
console.log("Bearer Token (Copy and paste into ChatGPT Authorization / Header settings):");
console.log("");
console.log(token);
console.log("");
console.log("--------------------------------------------------------------------------------");
console.log("Sample Header:");
console.log(`Authorization: Bearer ${token}`);
console.log("================================================================================");
