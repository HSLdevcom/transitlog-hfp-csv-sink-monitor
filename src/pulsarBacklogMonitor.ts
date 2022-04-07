import fetch from "node-fetch"
import { alertSlack } from "./alertSlack"
import { HFP_MONITOR_PULSAR_PROXY_IP } from "./constants"
import { HFP_MONITOR_PULSAR_ADMIN_PORT } from "./constants"
import { ensureSecretExists } from "./utils"

const MESSAGE_COUNT_BOUNDARY_IN_MILLIONS = 50 // 50M messages = approximately data from 12 hours

export async function runPulsarBacklogMonitor() {
    try {
        await pulsarBacklogMonitor()
    } catch(e) {
        let alertMessage = 'Something bad happened. There seems to be an issue with pulsar backlog message count. Investigate and fix the problem.'
        console.log('Something bad happened: ', e)
        await alertSlack(alertMessage)
    }
}

async function pulsarBacklogMonitor() {
    ensureSecretExists(HFP_MONITOR_PULSAR_PROXY_IP, 'HFP_MONITOR_PULSAR_PROXY_IP')
    ensureSecretExists(HFP_MONITOR_PULSAR_ADMIN_PORT, 'HFP_MONITOR_PULSAR_ADMIN_PORT')

    console.log(`Running Pulsar Backlog Monitor.`)

    /**
     * Taken from https://pulsar.apache.org/docs/en/admin-api-topics/#get-stats
     *
     * The syntax to get topic stats via REST-API GET-request is:
     * URL: /admin/v2/:schema/:tenant/:namespace/:topic/stats
     *
     * Schema: persistent
     * Tenant: dev-transitdata
     * Namespace: hfp
     * Topic name: v2
     *
     * NOTE: when developing locally, you have to have a tunnel open to pulsar_dev_proxy.
     * Ask for a command from Transitlog / Transitdata team, if you dont have one.
     */
    let response
    try {
        response = await fetch(
            `http://${HFP_MONITOR_PULSAR_PROXY_IP}:${HFP_MONITOR_PULSAR_ADMIN_PORT}/admin/v2/persistent/dev-transitdata/hfp/v2/stats`,
            {
                method: 'GET',
            }
        )
    } catch(e) {
        console.log('Request to pulsar failed: ', e)
        throw new Error('Request to pulsar failed.')
    }

    let jsonResponse = await response.json()

    let hfpTopicStats = jsonResponse?.['subscriptions']?.['transitlog_hfp_csv_sink']

    if (!hfpTopicStats) {
        throw new Error('Could not find hfp topic stats. Has the pulsar IP / tenant / namespace / topic changed recently?')
    }
    let rawBacklogMessageCount = hfpTopicStats?.['msgBacklog']
    if (isNaN(rawBacklogMessageCount)) {
        throw new Error('Could not read hfp backlog message count, msgBacklog was NaN.')
    }

    let backlogMessageCountInMillions = rawBacklogMessageCount / 1000000
    let alertMessage
    if (backlogMessageCountInMillions > MESSAGE_COUNT_BOUNDARY_IN_MILLIONS) {
        alertMessage = `HFP-sink Pulsar backlog has ~${backlogMessageCountInMillions.toFixed(1)} million messages (as a comparison 65 million messages corresponds to approximately data from 12 hours in congestion times). This is just for your info, it's good to keep an eye on this situation. Note: a long backlog can delay the time when blobs are loaded. Currently backlog size is 80 Gb so it can hold data from 3 days. Warning: after passing this boundary, HFP-data starts to disappear.`
    }
    if (alertMessage) {
        await alertSlack(alertMessage)
    }
    console.log('Pulsar monitoring complete, backlog message count was: ', backlogMessageCountInMillions)
}
