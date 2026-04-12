import { createClient } from "@supabase/supabase-js";
import { chromium, Page } from "playwright";
import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SIMULATION_URL = process.env.SIMULATION_URL || "";
const HEADLESS = process.env.HEADLESS === "true";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "10000");

type AgentRun = {
  id: string;
  application_id: string;
  status: string;
};

type Application = {
  id: string;
  requested_amount: number | null;
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

async function fillRequired(
  page: Page,
  selectors: string[],
  value: string | null | undefined,
  fieldName: string
) {
  if (!value) {
    throw new Error(`Missing value for ${fieldName}`);
  }

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();

    console.log(`[${fieldName}] trying ${selector} count=${count}`);

    if (count > 0) {
      await locator.fill(value);
      const actualValue = await locator.inputValue().catch(() => "");
      console.log(`[${fieldName}] filled with ${selector} = ${actualValue}`);
      return;
    }
  }

  throw new Error(`Selector not found for ${fieldName}: ${selectors.join(" | ")}`);
}

async function fillOptional(
  page: Page,
  selectors: string[],
  value: string | null | undefined,
  fieldName: string
) {
  if (!value) {
    console.log(`[${fieldName}] skipped`);
    return;
  }

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();

    if (count > 0) {
      await locator.fill(value);
      console.log(`[${fieldName}] filled using ${selector}`);
      return;
    }
  }

  console.log(`[${fieldName}] no selector matched`);
}

async function selectOptional(
  page: Page,
  selectors: string[],
  value: string | null | undefined,
  fieldName: string
) {
  if (!value) {
    console.log(`[${fieldName}] skipped`);
    return;
  }

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();

    if (count > 0) {
      await locator.selectOption({ label: value }).catch(async () => {
        await locator.selectOption({ value }).catch(async () => {
          const options = await locator.locator("option").allTextContents();
          const matched = options.find((opt) => opt.trim() === value.trim());

          if (matched) {
            await locator.selectOption({ label: matched });
            return;
          }

          throw new Error(`No matching option for ${fieldName}: ${value}`);
        });
      });

      console.log(`[${fieldName}] selected using ${selector}`);
      return;
    }
  }

  console.log(`[${fieldName}] no selector matched`);
}

async function handleStep1(page: Page, application: Application) {
  console.log("Starting Step 1");

  await fillRequired(page, ["#first_name"], application.first_name, "first_name");
  await fillRequired(page, ["#last_name"], application.last_name, "last_name");

  await fillRequired(
    page,
    ["#customer_id", "#id_number", '[name="id_number"]'],
    application.id_number,
    "id_number"
  );

  await fillRequired(
    page,
    [
      "#phone",
      "#mobile_phone",
      "#phone_number",
      "#customer_phone",
      '[name="phone"]',
      '[name="mobile_phone"]',
      'input[type="tel"]',
    ],
    application.phone,
    "phone"
  );

  await fillOptional(
    page,
    ["#estimated_amount"],
    application.requested_amount ? String(application.requested_amount) : null,
    "requested_amount"
  );

  await fillOptional(page, ["#id_issue_date"], application.id_issue_date, "id_issue_date");
  await fillOptional(page, ["#birth_date"], application.birth_date, "birth_date");

  if (application.gender === "זכר") {
    await page.click("text=זכר");
  } else if (application.gender === "נקבה") {
    await page.click("text=נקבה");
  }

  await selectOptional(page, ["#marital_status"], application.marital_status, "marital_status");
  await fillOptional(page, ["#city"], application.city, "city");
  await fillOptional(page, ["#street"], application.street, "street");
  await fillOptional(page, ["#house_number"], application.house_number, "house_number");
  await fillOptional(
    page,
    ["#apartment", "#apartment_number", "#apt", '[name="apartment"]'],
    application.apartment || "1",
    "apartment"
  );

  try {
    await page.click("text=אני מאשר");
  } catch {
    console.log("Declaration checkbox not found by text");
  }

  console.log("Step 1 filled successfully");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processSingleRun() {
  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!SIMULATION_URL) throw new Error("Missing SIMULATION_URL");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("Checking for pending runs...");

  const { data: runs, error: runError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (runError) {
    throw new Error(runError.message);
  }

  if (!runs || runs.length === 0) {
    console.log("No pending runs");
    return;
  }

  const run = runs[0] as AgentRun;
  console.log("Run:", run.id);

  const { error: runningError } = await supabase
    .from("agent_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "pending");

  if (runningError) {
    throw new Error(`Failed to mark run as running: ${runningError.message}`);
  }

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", run.application_id)
    .single();

  if (appError) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: appError.message,
      })
      .eq("id", run.id);

    throw new Error(appError.message);
  }

  console.log("Application:", application.id);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  try {
    await page.goto(SIMULATION_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await handleStep1(page, application as Application);

    await page.screenshot({ path: "/tmp/step1-filled.png", fullPage: true });

    const fileBuffer = fs.readFileSync("/tmp/step1-filled.png");

    await supabase.storage
      .from("screenshots")
      .upload(`step1-${Date.now()}.png`, fileBuffer, {
        contentType: "image/png",
      });

    console.log("Screenshot uploaded");

    const { error: successError } = await supabase
      .from("agent_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", run.id);

    if (successError) {
      throw new Error(`Failed to mark run as success: ${successError.message}`);
    }

    console.log(`Run ${run.id} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", run.id);

    throw err;
  } finally {
    await browser.close();
  }
}

async function startWorker() {
  console.log("credit-agent worker started");

  while (true) {
    try {
      await processSingleRun();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Worker cycle failed:", message);
    }

    console.log(`Sleeping for ${POLL_INTERVAL_MS}ms...`);
    await sleep(POLL_INTERVAL_MS);
  }
}

startWorker().catch((err) => {
  console.error("Agent failed:", err.message);
  process.exit(1);
});
