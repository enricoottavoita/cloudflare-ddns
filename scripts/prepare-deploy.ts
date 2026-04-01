import {
	D1_DATABASE_ID_ENV,
	D1_DATABASE_NAME_ENV,
	getOptionalEnvVar,
	getPrimaryD1Binding,
	info,
	isMainModule,
	isPlaceholderDatabaseId,
	isUuid,
	readWranglerConfig,
	writeWranglerConfig,
} from "./common.ts";
import process from "node:process";

function envSummary(databaseId: string, databaseName: string): string {
	if (databaseId && databaseName) {
		return `${D1_DATABASE_ID_ENV} and ${D1_DATABASE_NAME_ENV}`;
	}

	if (databaseId) {
		return D1_DATABASE_ID_ENV;
	}

	return D1_DATABASE_NAME_ENV;
}

export async function prepareDeploy(): Promise<boolean> {
	const config = await readWranglerConfig();
	const existingBinding = getPrimaryD1Binding(config);
	const envDatabaseId = getOptionalEnvVar(D1_DATABASE_ID_ENV);
	const envDatabaseName = getOptionalEnvVar(D1_DATABASE_NAME_ENV);

	if (!envDatabaseId && !envDatabaseName) {
		return false;
	}

	if (envDatabaseId && (!isUuid(envDatabaseId) || isPlaceholderDatabaseId(envDatabaseId))) {
		throw new Error(`${D1_DATABASE_ID_ENV} must be a real D1 database UUID.`);
	}

	const nextBinding = {
		binding: existingBinding?.binding || "DB",
		database_name: envDatabaseName || existingBinding?.database_name || `${config.name}-db`,
		database_id: envDatabaseId || existingBinding?.database_id || "",
	};

	if (!nextBinding.database_id) {
		throw new Error(
			`No D1 database_id is configured. Set ${D1_DATABASE_ID_ENV} for this deploy or run \`pnpm setup:db\` locally.`,
		);
	}

	if (!isUuid(nextBinding.database_id) || isPlaceholderDatabaseId(nextBinding.database_id)) {
		throw new Error(
			`The configured D1 database_id is still a placeholder. Set ${D1_DATABASE_ID_ENV} for this deploy or run \`pnpm setup:db\` locally.`,
		);
	}

	const bindingUnchanged =
		existingBinding?.binding === nextBinding.binding &&
		existingBinding?.database_name === nextBinding.database_name &&
		existingBinding?.database_id === nextBinding.database_id;

	if (bindingUnchanged) {
		return false;
	}

	config.d1_databases = [
		nextBinding,
		...(config.d1_databases?.slice(1) ?? []),
	];

	await writeWranglerConfig(config);
	await info(`Updated wrangler.jsonc D1 binding from ${envSummary(envDatabaseId, envDatabaseName)}.`);
	return true;
}

async function main(): Promise<void> {
	await prepareDeploy();
}

if (isMainModule(import.meta.url)) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}
