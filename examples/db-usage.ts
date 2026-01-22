#!/usr/bin/env bun
/**
 * Example: Using the agent-yes database to track projects and runs
 */

import {
  closeDb,
  createRun,
  getAllProjects,
  getCrashedRuns,
  getProjectByDir,
  getProjectWithLatestRun,
  getRunningRuns,
  markRunAsCrashed,
  updateRunStatus,
  upsertProject,
} from "../ts/db";

async function main() {
  console.log("🗄️  Agent-Yes Database Example\n");

  // 1. Create/update a project
  console.log("1️⃣  Creating project...");
  const projectResult = await upsertProject({
    dir: process.cwd(),
    cmd: "claude",
    prompt: "run all tests and commit changes",
  });
  const projectId =
    "insertId" in projectResult
      ? Number(projectResult.insertId)
      : Number(projectResult.numUpdatedRows);
  console.log("   Project ID:", projectId);

  // Get the actual project to get its ID
  const project = await getProjectByDir(process.cwd());
  if (!project) throw new Error("Failed to create project");

  // 2. Start a run
  console.log("\n2️⃣  Starting a run...");
  const runResult = await createRun({
    pid: process.pid,
    project_id: project.id,
    args: ["--exit-on-idle=60s"],
  });
  console.log("   Run started:", runResult.insertId);

  // 3. Check running runs
  console.log("\n3️⃣  Checking running runs...");
  const runningRuns = await getRunningRuns();
  console.log(`   Found ${runningRuns.length} running run(s)`);
  for (const run of runningRuns) {
    console.log(`   - Run #${run.id} (PID: ${run.pid})`);
  }

  // 4. Get project with latest run
  console.log("\n4️⃣  Getting project with latest run...");
  const projectInfo = await getProjectWithLatestRun(process.cwd());
  if (projectInfo) {
    console.log("   Project:", projectInfo.project.dir);
    console.log("   Command:", projectInfo.project.cmd);
    console.log("   Total runs:", projectInfo.totalRuns);
    if (projectInfo.latestRun) {
      console.log("   Latest run status:", projectInfo.latestRun.status);
    }
  }

  // 5. Update run status
  console.log("\n5️⃣  Completing the run...");
  await updateRunStatus(Number(runResult.insertId), "completed", 0);
  console.log("   Run marked as completed");

  // 6. Start another run and mark it as crashed
  console.log("\n6️⃣  Simulating a crashed run...");
  const crashedRun = await createRun({
    pid: 99999,
    project_id: project.id,
    args: ["--some-flag"],
  });
  await markRunAsCrashed(Number(crashedRun.insertId));
  console.log("   Run marked as crashed");

  // 7. Get all crashed runs
  console.log("\n7️⃣  Finding crashed runs...");
  const crashed = await getCrashedRuns();
  console.log(`   Found ${crashed.length} crashed run(s)`);
  for (const run of crashed) {
    console.log(`   - Run #${run.run_id} in ${run.dir} (PID: ${run.pid})`);
  }

  // 8. List all projects
  console.log("\n8️⃣  Listing all projects...");
  const allProjects = await getAllProjects();
  console.log(`   Found ${allProjects.length} project(s)`);
  for (const project of allProjects) {
    console.log(`   - ${project.dir}`);
    console.log(`     Command: ${project.cmd}`);
    if (project.prompt) {
      console.log(`     Prompt: ${project.prompt}`);
    }
    if (project.last_run_at) {
      const lastRun = new Date(project.last_run_at);
      console.log(`     Last run: ${lastRun.toLocaleString()}`);
    }
  }

  // 9. Close the database
  console.log("\n9️⃣  Closing database...");
  await closeDb();
  console.log("   Database closed");

  console.log("\n✅ Example completed!");
  console.log(`\n📂 Database location: ${process.cwd()}/.agent-yes/store.sqlite`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
