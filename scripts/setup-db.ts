import {
	ensureWranglerAuth,
	getPrimaryD1Binding,
	info,
	isMainModule,
	isUuid,
	prompt,
	readWranglerConfig,
	runWrangler,
	step,
	outro,
	writeWranglerConfig,
} from "./common.ts";

function extractDatabaseId(output: string): string | null {
	const match = output.match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/i);
	return match?.[1] ?? null;
}

export async function setupDatabase(): Promise<string> {
	const config = await readWranglerConfig();
	const existingBinding = getPrimaryD1Binding(config);
	const existingId = existingBinding?.database_id;

	if (existingId && isUuid(existingId)) {
		await info(`D1 database is already configured: ${existingBinding.database_name} (${existingId})`);
		return existingId;
	}

	ensureWranglerAuth();
	await step("D1 database setup");

	const defaultName = existingBinding?.database_name || `${config.name}-db`;
	const databaseName = await prompt("D1 database name", { defaultValue: defaultName });
	const output = runWrangler(["d1", "create", databaseName]);
	const databaseId = extractDatabaseId(output);

	if (!databaseId) {
		throw new Error(
			`Wrangler created a database but the script could not find the database_id in the output.\n${output}`,
		);
	}

	config.d1_databases = [
		{
			binding: existingBinding?.binding || "DB",
			database_name: databaseName,
			database_id: databaseId,
		},
	];

	await writeWranglerConfig(config);
	console.log(`Updated wrangler.jsonc with D1 database ${databaseName} (${databaseId}).`);
	return databaseId;
}

async function main(): Promise<void> {
	await setupDatabase();
	await outro("Next: run `pnpm setup:secrets` or `pnpm setup`.");
}

if (isMainModule(import.meta.url)) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}