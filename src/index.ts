import { createClient } from "@supabase/supabase-js";
import { chromium, Page } from "playwright";
import fs from "fs";

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

async function fillRequired(page: Page, selector: string, value: string | null | undefined, fieldName: string) {
  if (!value) {
    throw new Error(`Missing value for ${fieldName}`);
  }

  const locator = page.locator(selector).first();
  const count = await locator.count();

  console.log(`[${fieldName}] selector=${selector} count=${count} value=${value}`);

  if (count === 0) {
    throw new Error(`Selector not found for ${fieldName}: ${selector}`);
  }

  await locator.fill(value);

  const actualValue = await locator.inputValue().catch(() => "");
  console.log(`[${fieldName}] filled value now = ${actualValue}`);
}

async function fillOptional(page: Page, selector: string, value: string | null | undefined, fieldName: string) {
  if (!value) {
    console.log(`[${fieldName}] skipped - no value`);
    return;
  }

  const locator = page.locator(selector).first();
  const count = await locator.count();

  console.log(`[${fieldName}] selector=${selector} count=${count} value=${value}`);

  if (count === 0) {
    console.log(`[${fieldName}] selector not found`);
    return;
  }

  await locator.fill(value);

  const actualValue = await locator.inputValue().catch(() => "");
  console.log(`[${fieldName}] filled value now = ${actualValue}`);
}

async function checkRequired(page: Page, selector: string, fieldName: string) {
  const locator = page.locator(selector).first();
  const count = await locator.count();

  if (count === 0) {
    throw new Error(`Checkbox selector not found for ${fieldName}: ${selector}`);
  }

  await locator.check().catch(async () => {
    await locator.click();
  });
}

  async function handleStep1(page: Page, application: Application) {
  console.log("Starting Step 1");

  await fillRequired(page, '#first_name', application.first_name, "first_name");
  await fillRequired(page, '#last_name', application.last_name, "last_name");
  await fillRequired(page, '#id_number', application.id_number, "id_number");
  await fillRequired(page, '#phone', application.phone, "phone");

  await fillOptional(page, '#id_issue_date', application.id_issue_date, "id_issue_date");
  await fillOptional(page, '#birth_date', application.birth_date, "birth_date");
  await fillOptional(page, '#gender', application.gender, "gender");
  await fillOptional(page, '#marital_status', application.marital_status, "marital_status");
  await fillOptional(page, '#city', application.city, "city");
  await fillOptional(page, '#street', application.street, "street");
  await fillOptional(page, '#house_number', application.house_number, "house_number");
  await fillOptional(page, '#apartment', application.apartment || "1", "apartment");

  await checkRequired(page, '#customer_identification_declaration', "customer_identification_declaration");

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
  .order("created_at", { ascending: false })
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

const fileBuffer = fs.readFileSync("/tmp/step1-filled.png");

await supabase.storage
  .from("screenshots")
  .upload(`step1-${Date.now()}.png`, fileBuffer, {
    contentType: "image/png",
  });

console.log("Screenshot uploaded to Supabase");

    console.log("Agent finished successfully after Step 1");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Agent failed:", err.message);
  process.exit(1);
});
