import fetch from "node-fetch"
import { alertSlack } from "./alertSlack"
import { PULSAR_IP } from "./constants"
import { PULSAR_PORT } from "./constants"

const MESSAGE_COUNT_BOUNDARY_IN_MILLIONS = 50 // 50M messages = approx data from 12 hours

export async function runPulsarBacklogMonitor() {
    try {
        await pulsarBacklogMonitor()
    } catch(e) {
        let alertMessage = 'Something bad happened. There seems to be an issue with pulsar backlog message count. Investigate and fix the problem.'
        console.log('Something bad happened: ', e)
        // await alertSlack(alertMessage)
    }
}

async function pulsarBacklogMonitor() {
    console.log('at pulsarBacklogMonitor')
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
     */
    let response
    try {
        response = await fetch(
            `http://${PULSAR_IP}:${PULSAR_PORT}/admin/v2/persistent/dev-transitdata/hfp/v2/stats`,
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
    let backlogMessageCount = rawBacklogMessageCount / 1000000
    let alertMessage
    if (backlogMessageCount > MESSAGE_COUNT_BOUNDARY_IN_MILLIONS) {
        alertMessage = `HFP-sinkin Pulsar backlogilla on viestejä ~${backlogMessageCount.toFixed(1)} miljoonaa (vertailun vuoksi 65 miljoonaa viestiä vastaa dataa noin 12h ajalta ruuhka-aikana). Tämä siis vain tiedoksi, tilannetta on hyvä tarkkailla. Huom. pitkä backlog voi lisätä viivettä siihen, milloin blobit latautuvat. Tällä hetkellä backlogin koko on 80 GB eli sinne mahtuu noin 3 päivän datat. Varoitus: tämän rajan ylittyessä HFP-dataa alkaa kadota.`
    }
    if (alertMessage) {
        console.log('alertMessage ', alertMessage)
        // await alertSlack(alertMessage)
    }
    // TODO: remove when it works
    console.log('Pulsar monitoring complete, message count: ', backlogMessageCount)
}
