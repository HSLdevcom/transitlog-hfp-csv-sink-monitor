require('dotenv').config()

import schedule from 'node-schedule'
import {HFP_CURRENT_DAY_MONITOR_CRON, HFP_PREVIOUS_DAY_MONITOR_CRON} from './constants'
import {runCurrentDayMonitor} from './currentDayMonitor';
import { runPreviousDayMonitor } from './previousDayMonitor';

export function scheduleCurrentDataMonitor() {
    if (!HFP_CURRENT_DAY_MONITOR_CRON) {
        throw new Error('HFP_CURRENT_DAY_MONITOR_CRON ENV variable is missing.')
    }

    console.log(`Scheduled monitor with cron: ${HFP_CURRENT_DAY_MONITOR_CRON}`);

    let job = schedule.scheduleJob(HFP_CURRENT_DAY_MONITOR_CRON, runCurrentDayMonitor)
    if (job) {
        console.log('Next monitoring will run:', job.nextInvocation().toLocaleString())
    }
}

export function schedulePreviousDataMonitor() {
    if (!HFP_PREVIOUS_DAY_MONITOR_CRON) {
        throw new Error('HFP_PREVIOUS_DAY_MONITOR_CRON ENV variable is missing.')
    }

    console.log(`Scheduled monitor with cron: ${HFP_PREVIOUS_DAY_MONITOR_CRON}`);

    let job = schedule.scheduleJob(HFP_PREVIOUS_DAY_MONITOR_CRON, runPreviousDayMonitor)
    if (job) {
        console.log('Next monitoring will run:', job.nextInvocation().toLocaleString())
    }
}


// To run locally, comment scheduling out and call these straigthly:
// runCurrentDayMonitor()
// runPreviousDayMonitor()

scheduleCurrentDataMonitor()
schedulePreviousDataMonitor()

