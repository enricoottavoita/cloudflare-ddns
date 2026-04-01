import { ensureWranglerAuth, intro, isMainModule, outro, promptYesNo, runWrangler, step } from "./common.ts";
import { setupDatabase } from "./setup-db.ts";
import { setupSecrets } from "./setup-secrets.ts";
import { verifySetup } from "./verify-setup.ts";

interface SetupProjectOptions {
	deployNow?: boolean;
}

export async function setupProject(options: SetupProjectOptions = {}): Promise<void> {
	await intro("Cloudflare DDNS setup");
	ensureWranglerAuth();

	await setupDatabase();
	await setupSecrets();
	await verifySetup();

	const shouldDeploy = options.deployNow ?? (await promptYesNo("Run remote migrations and deploy now?", true));
	if (!shouldDeploy) {
		await outro("Setup complete. Run `pnpm deploy` when you are ready.");
		return;
	}

	await step("Applying migrations");
	runWrangler(["d1", "migrations", "apply", "DB", "--remote"], { stdio: "inherit" });

	await step("Deploying Worker");
	runWrangler(["deploy"], { stdio: "inherit" });
	await outro("Deployment complete.");
}

async function main(): Promise<void> {
	await setupProject({ deployNow: process.argv.includes("--deploy") ? true : undefined });
}

if (isMainModule(import.meta.url)) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}