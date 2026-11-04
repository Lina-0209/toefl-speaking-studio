import { randomBytes } from "node:crypto";
// Run locally and save directly in your own deployment secret settings.
process.stdout.write(randomBytes(32).toString("base64") + "\n");
