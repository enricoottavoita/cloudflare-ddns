import {
	REQUIRED_SECRETS,
	getPrimaryD1Binding,
	isMainModule,
	isPlaceholderDatabaseId,
	isUuid,
	parseSecretList,
	readWranglerConfig,
	runWrangler,
} from "./common.ts";

function missingRequiredSecrets(config: Awaited<ReturnType<typeof readWranglerConfig>>): string[] {
	const configured = new Set(config.secrets?.required || []);
	return REQUIRED_SECRETS.filter((name) => !configured.has(name));
}

export async function verifySetup(): Promise<boolean> {
	const config = await readWranglerConfig();
	const errors: string[] = [];

	const binding = getPrimaryD1Binding(config);
	if (!binding) {
		errors.push("Missing D1 binding `DB` in wrangler.jsonc.");
	} else if (!binding.database_id || !isUuid(binding.database_id) || isPlaceholderDatabaseId(binding.database_id)) {
		errors.push("D1 database_id is missing or still set to the placeholder. Run `pnpm setup:db`.");
	}

	const missingSecretsConfig = missingRequiredSecrets(config);
	if (missingSecretsConfig.length > 0) {
		errors.push(
			`wrangler.jsonc is missing required secret declarations for: ${missingSecretsConfig.join(", ")}`,
		);
	}

	let remoteSecretNames: string[] = [];
	try {
		const output = runWrangler(["secret", "list", "--format", "json"]);
		remoteSecretNames = parseSecretList(output);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(
			`Could not inspect deployed Worker secrets. Make sure you are logged into Wrangler and have run \`pnpm setup:secrets\`.\n${message}`,
		);
	}

	if (remoteSecretNames.length > 0) {
		const configuredSecrets = new Set(remoteSecretNames);
		const missingRemote = REQUIRED_SECRETS.filter((name) => !configuredSecrets.has(name));
		if (missingRemote.length > 0) {
			errors.push(`Missing deployed Worker secrets: ${missingRemote.join(", ")}. Run \`pnpm setup:secrets\`.`);
		}
	}

	if (errors.length > 0) {
		throw new Error(errors.join("\n\n"));
	}

	console.log(`Setup looks good for Worker ${config.name}.`);
	return true;
}

async function main(): Promise<void> {
	await verifySetup();
}

if (isMainModule(import.meta.url)) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}