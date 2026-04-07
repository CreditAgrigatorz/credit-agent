import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SIMULATION_URL = process.env.SIMULATION_URL || "";
const HEADLESS = process.env.HEADLESS === "true";

async function main() {
  console.log("credit-agent started");

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!SIMULATION_URL) throw new Error("Missing SIMULATION_URL");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  console.log("Checking for pending runs...");

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "pending")
    .limit(1);

  if (error) {
    console.error("Supabase error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No pending runs found");
    return;
  }

  console.log("Pending run found → launching browser");

  // 🚀 Playwright מתחיל כאן
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  console.log("Opening simulation:", SIMULATION_URL);

  await page.goto(SIMULATION_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log("Page loaded successfully");

  // בדיקה בסיסית
  const title = await page.title();
  console.log("Page title:", title);

  await browser.close();

  console.log("Agent finished successfully");
}

main().catch((err) => {
  console.error("Agent failed:", err.message);
  process.exit(1);
});
