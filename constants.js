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

export const HFP_STORAGE_CONNECTION_STRING = secretsEnv.HFP_STORAGE_CONNECTION_STRING || "";
export const HFP_CONTAINER_NAME = secretsEnv.HFP_CONTAINER_NAME || "";
export const MONITOR_CRON = secretsEnv.MONITOR_CRON || "";
export const MONITOR_SLACK_WEBHOOK_URL = secretsEnv.MONITOR_SLACK_WEBHOOK_URL || "";
export const MONITOR_SLACK_USER_IDS = secretsEnv.MONITOR_SLACK_USER_IDS || "";
