import { mapValues, orderBy } from "lodash";
import fs from "fs-extra";

const SECRETS_PATH = "/run/secrets/";

// Check each env var and see if it has a value in the secrets. In that case, use the
// secret value. Otherwise use the env var. Using sync fs methods for the sake of
// simplicity, since this will only run once when staring the app, sync is OK.
const secrets = (fs.existsSync(SECRETS_PATH) && fs.readdirSync(SECRETS_PATH)) || [];

const secretsEnv = mapValues(process.env, (value, key) => {
    const matchingSecrets = secrets.filter((secretFile) => secretFile.startsWith(key));

    const currentSecret =
        orderBy(
            matchingSecrets,
            (secret) => {
                const secretVersion = parseInt(secret[secret.length - 1], 10);
                return isNaN(secretVersion) ? 0 : secretVersion;
            },
            "desc",
        )[0] || null;

    const filepath = SECRETS_PATH + currentSecret;

    if (fs.existsSync(filepath)) {
        return (fs.readFileSync(filepath, { encoding: "utf8" }) || "").trim();
    }

    return value;
});

// Non secrets
export const HFP_CURRENT_DAY_MONITOR_CRON = secretsEnv.HFP_CURRENT_DAY_MONITOR_CRON || "";
export const HFP_PREVIOUS_DAY_MONITOR_CRON = secretsEnv.HFP_PREVIOUS_DAY_MONITOR_CRON || "";
export const PULSAR_BACKLOG_MONITOR_CRON = secretsEnv.PULSAR_BACKLOG_MONITOR_CRON || ""
export const AVAILABLE_DISK_SPACE_MONITOR_CRON = secretsEnv.AVAILABLE_DISK_SPACE_MONITOR_CRON || ""
export const HFP_MONITOR_SLACK_USER_IDS = secretsEnv.HFP_MONITOR_SLACK_USER_IDS || "";
export const HFP_MONITOR_PULSAR_ADMIN_PORT = secretsEnv.HFP_MONITOR_PULSAR_ADMIN_PORT || ""
export const HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT = secretsEnv.HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT || ""

// Secrets
export const HFP_MONITOR_TARGET_ENVIRONMENT  = secretsEnv.HFP_MONITOR_TARGET_ENVIRONMENT || ""
export const HFP_STORAGE_CONNECTION_STRING = secretsEnv.HFP_STORAGE_CONNECTION_STRING || "";
export const HFP_STORAGE_CONTAINER_NAME = secretsEnv.HFP_STORAGE_CONTAINER_NAME || "";
export const HFP_MONITOR_SLACK_WEBHOOK_URL = secretsEnv.HFP_MONITOR_SLACK_WEBHOOK_URL || "";
export const HFP_MONITOR_PULSAR_PROXY_IP = secretsEnv.HFP_MONITOR_PULSAR_PROXY_IP || ""
export const HFP_MONITOR_PULSAR_BOOKIE_IP_1 = secretsEnv.HFP_MONITOR_PULSAR_BOOKIE_IP_1 || ""
export const HFP_MONITOR_PULSAR_BOOKIE_IP_2 = secretsEnv.HFP_MONITOR_PULSAR_BOOKIE_IP_2 || ""
export const HFP_MONITOR_PULSAR_BOOKIE_IP_3 = secretsEnv.HFP_MONITOR_PULSAR_BOOKIE_IP_3 || ""
