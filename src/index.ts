import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SIMULATION_URL = process.env.SIMULATION_URL || "";

async function main() {
  console.log("credit-agent started");

  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!SIMULATION_URL) {
    throw new Error("Missing SIMULATION_URL");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log("Connecting to Supabase...");

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "pending")
    .limit(1);

  if (error) {
    console.error("Supabase query error:", error.message);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log("No pending runs found");
    return;
  }

  console.log("Pending run found:", data[0]);
}

main().catch((error) => {
  console.error("Agent failed:", error.message);
  process.exit(1);
});
