/**
 * D1-backed update logging.
 *
 * Each DDNS update attempt (success or failure) is recorded so operators
 * can audit what happened. A scheduled cron job calls `cleanupLogs` to
 * prune rows older than the configured retention period, keeping the
 * D1 database within free-tier row limits.
 */

import type { UpdateAction } from "./types";

/** Shape of a row in the `ddns_logs` table. */
export interface DdnsLogEntry {
	hostname: string;
	record_type: string;
	ip: string;
	action: UpdateAction;
	error_message: string | null;
	source: "synology" | "api";
}

/**
 * Insert a single update log row into D1.
 *
 * Failures are intentionally swallowed (logged to console) so that a
 * D1 hiccup does not prevent the DNS update response from reaching
 * the caller.
 */
export async function logUpdate(db: D1Database, entry: DdnsLogEntry): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO ddns_logs (hostname, record_type, ip, action, error_message, source)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				entry.hostname,
				entry.record_type,
				entry.ip,
				entry.action,
				entry.error_message,
				entry.source,
			)
			.run();
	} catch (err) {
		console.error("Failed to write DDNS log entry:", err);
	}
}

/**
 * Delete log rows older than `retentionDays` days.
 * Returns the number of deleted rows, or 0 if the cleanup fails.
 */
export async function cleanupLogs(db: D1Database, retentionDays: number): Promise<number> {
	try {
		const result = await db
			.prepare(`DELETE FROM ddns_logs WHERE created_at < datetime('now', ? || ' days')`)
			.bind(-retentionDays)
			.run();
		return result.meta.changes ?? 0;
	} catch (err) {
		console.error("Failed to clean up DDNS logs:", err);
		return 0;
	}
}
