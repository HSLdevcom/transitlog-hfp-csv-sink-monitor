require('dotenv').config()

import schedule from 'node-schedule'
import {AVAILABLE_DISK_SPACE_MONITOR_CRON, HFP_CURRENT_DAY_MONITOR_CRON, HFP_PREVIOUS_DAY_MONITOR_CRON, PULSAR_BACKLOG_MONITOR_CRON} from './constants'
import {runCurrentDayMonitor} from './currentDayMonitor';
import { runPreviousDayMonitor } from './previousDayMonitor';
import { runAvailableDiskSpaceMonitor } from './pulsarAvailableDiskSpaceMonitor';
import { runPulsarBacklogMonitor } from './pulsarBacklogMonitor';
import { ensureSecretExists } from './utils';

function scheduleMonitorWithCron(cronValue: string, cronName: string, cronJob: () => void) {
    ensureSecretExists(cronValue, cronName)

    console.log(`Scheduled monitor with cron: ${cronValue}`);

    let job = schedule.scheduleJob(cronValue, cronJob)
    if (job) {
        console.log('Next monitoring will run:', job.nextInvocation().toLocaleString())
    }
}


// To run locally, comment scheduling out and call these straigthly:
// runCurrentDayMonitor()
// runPreviousDayMonitor()
// runPulsarBacklogMonitor()
// runAvailableDiskSpaceMonitor()

// Schedule all monitor jobs with cron
scheduleMonitorWithCron(HFP_CURRENT_DAY_MONITOR_CRON, 'HFP_CURRENT_DAY_MONITOR_CRON', runCurrentDayMonitor)
scheduleMonitorWithCron(HFP_PREVIOUS_DAY_MONITOR_CRON, 'HFP_PREVIOUS_DAY_MONITOR_CRON', runPreviousDayMonitor)
scheduleMonitorWithCron(PULSAR_BACKLOG_MONITOR_CRON, 'PULSAR_BACKLOG_MONITOR_CRON', runPulsarBacklogMonitor)
scheduleMonitorWithCron(AVAILABLE_DISK_SPACE_MONITOR_CRON, 'AVAILABLE_DISK_SPACE_MONITOR_CRON', runAvailableDiskSpaceMonitor)
