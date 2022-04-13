import fetch from "node-fetch"
import http from "http"
import { alertSlack } from "./alertSlack"
import {HFP_MONITOR_PULSAR_BOOKIE_IP_2, HFP_MONITOR_PULSAR_BOOKIE_IP_3, HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT } from "./constants"
import { HFP_MONITOR_PULSAR_BOOKIE_IP_1 } from "./constants"
import { ensureSecretExists } from "./utils"

const REQUIRED_AVAILABLE_DISK_SPACE_PERCENTAGE = 20

/**
 * Designed so that at each Pulsar VM we have a bash script listening
 * to a port and responding currently used disk space at a path
 * that we want to monitor.
 *
 * If available disk space is OK, no alert is sent
 * If available disk space is NOT ok, an alert to slack is sent
 * If a request to Pulsar VM fails or takes too long, an alert to slack is sent
 */
export async function runAvailableDiskSpaceMonitor() {
    try {
        await availableDiskSpaceMonitor()
    } catch(e) {
        let alertMessage = 'Something bad happened. There seems to be an issue with available disk space monitor. Investigate and fix the problem.'
        console.log('Something bad happened: ', e)
        await alertSlack(alertMessage)
    }
}

async function availableDiskSpaceMonitor() {
    ensureSecretExists(HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT, 'HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT')
    ensureSecretExists(HFP_MONITOR_PULSAR_BOOKIE_IP_1, 'HFP_MONITOR_PULSAR_BOOKIE_IP_1')
    ensureSecretExists(HFP_MONITOR_PULSAR_BOOKIE_IP_2, 'HFP_MONITOR_PULSAR_BOOKIE_IP_2')
    ensureSecretExists(HFP_MONITOR_PULSAR_BOOKIE_IP_3, 'HFP_MONITOR_PULSAR_BOOKIE_IP_3')

    console.log(`Running Available Disk Space Monitor.`)

    await monitorBookieAvailableDiskSpace(HFP_MONITOR_PULSAR_BOOKIE_IP_1)
    await delay(2500)
    await monitorBookieAvailableDiskSpace(HFP_MONITOR_PULSAR_BOOKIE_IP_2)
    await delay(2500)
    await monitorBookieAvailableDiskSpace(HFP_MONITOR_PULSAR_BOOKIE_IP_3)
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function monitorBookieAvailableDiskSpace(bookieIP: string) {
    /**
     * NOTE: when developing locally, you have to have a tunnel open to pulsar_bookie_1 for example.
     * Ask for a command from Transitlog / Transitdata team, if you dont have one.
     */
    const options = {
        port: HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT,
        path: '/',
        method: 'GET',
        headers: {
            'Host': bookieIP
        },
        timeout: 10000
    };

    return new Promise((resolve, reject) => {
        // We allow max 10 seconds for the request to go through.
        let requestTimeout = setTimeout(() => {
            reject(`Reached timeout when sending request to bookie: ${bookieIP}`);
        }, 10000)
        try {
            const req = http.request(options, (res) => {
                res.setEncoding('utf8');
                res.on('data', async (data) => {
                    if (data) {
                        let availableDiskSpaceResponse = data.trim()
                        availableDiskSpaceResponse = availableDiskSpaceResponse.replace('%', '')
                        // Currently availableDiskSpaceResponse = used disk space
                        let availableDiskSpace = 100 - parseInt(availableDiskSpaceResponse, 10)
                        if (availableDiskSpace < REQUIRED_AVAILABLE_DISK_SPACE_PERCENTAGE) {
                            let alertMessage = `Pulsar bookie (${bookieIP}) available disk space was: ${availableDiskSpace}%, required available percentage is: ${REQUIRED_AVAILABLE_DISK_SPACE_PERCENTAGE}%. Investigate this and fix as soon as possible.`
                            await alertSlack(alertMessage)
                        }
                        console.log(`Available disk space monitoring complete, available disk space of bookie ${bookieIP} was: ${availableDiskSpace}%`)
                    } else {
                        reject(`Did not receive data from bookie: ${bookieIP}.`)
                    }
                    clearTimeout(requestTimeout)
                    resolve('')
                });
                res.on('end', () => {
                    // Empty
                });
            });
            req.end();
        } catch (e) {
            console.log('Request to pulsar failed: ', e)
            reject(`Request to pulsar bookie failed.`)
        }
    })
}
