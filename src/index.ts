import { createClient } from "@supabase/supabase-js";
import { chromium, Page } from "playwright";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SIMULATION_URL = process.env.SIMULATION_URL || "";
const HEADLESS = process.env.HEADLESS === "true";

type AgentRun = {
  id: string;
  application_id: string;
  status: string;
};

type Application = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  id_issue_date: string | null;
  birth_date: string | null;
  phone: string | null;
  gender: string | null;
  marital_status: string | null;
  city: string | null;
  street: string | null;
  house_number: string | null;
  apartment: string | null;
};

async function fillIfExists(page: Page, selector: string, value: string | null | undefined) {
  if (!value) return;
  const locator = page.locator(selector).first();
  if (await locator.count()) {
    await locator.fill(value);
  }
}

async function checkIfExists(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  if (await locator.count()) {
    await locator.check().catch(async () => {
      await locator.click();
    });
  }
}

async function clickIfExists(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  if (await locator.count()) {
    await locator.click();
  }
}

async function handleStep1(page: Page, application: Application) {
  console.log("Starting Step 1");

  await fillIfExists(page, '[name="first_name"]', application.first_name);
  await fillIfExists(page, '[name="last_name"]', application.last_name);
  await fillIfExists(page, '[name="id_number"]', application.id_number);
  await fillIfExists(page, '[name="id_issue_date"]', application.id_issue_date);
  await fillIfExists(page, '[name="birth_date"]', application.birth_date);
  await fillIfExists(page, '[name="phone"]', application.phone);
  await fillIfExists(page, '[name="gender"]', application.gender);
  await fillIfExists(page, '[name="marital_status"]', application.marital_status);
  await fillIfExists(page, '[name="city"]', application.city);
  await fillIfExists(page, '[name="street"]', application.street);
  await fillIfExists(page, '[name="house_number"]', application.house_number);
  await fillIfExists(page, '[name="apartment"]', application.apartment || "1");

  await checkIfExists(page, '[name="customer_identification_declaration"]');

  console.log("Step 1 filled successfully");
}

async function main() {
  console.log("credit-agent started");

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!SIMULATION_URL) throw new Error("Missing SIMULATION_URL");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  console.log("Checking for pending runs...");

  const { data: runs, error: runError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "pending")
    .limit(1);

  if (runError) {
    throw new Error(`Supabase run query error: ${runError.message}`);
  }

  if (!runs || runs.length === 0) {
    console.log("No pending runs found");
    return;
  }

  const run = runs[0] as AgentRun;
  console.log("Pending run found:", run.id);

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", run.application_id)
    .single();

  if (appError) {
    throw new Error(`Application query error: ${appError.message}`);
  }

  console.log("Application loaded:", application.id);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  try {
    console.log("Opening simulation:", SIMULATION_URL);

    await page.goto(SIMULATION_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("Page loaded successfully");

    await handleStep1(page, application as Application);

    await page.screenshot({ path: "/tmp/step1-filled.png", fullPage: true });
    console.log("Screenshot saved: /tmp/step1-filled.png");

    console.log("Agent finished successfully after Step 1");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Agent failed:", err.message);
  process.exit(1);
});
