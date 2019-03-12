import {writeToLog} from '../browser/log';
import ofEvents from '../browser/of_events';
import route from '../common/route';
const System = require('../browser/api/system.js').System;
import { setInterval } from 'timers';
const {fetchOptions} = require('../browser/convert_options.js');
import {WinDiagnosticData, AppDiagnosticData} from '../shapes';
//    tslint:disable:no-multiline-string
export function init(argo: any) {
    if (!argo.diagnostics) {
        return;
    }
    fetchOptions(argo, (config: any) => {
        const { configObject: { 'startup_app': { uuid } } } = config;

        const appProblems = initEventReporter(uuid);

        setInterval(initDiagnosticReporter, 5000, uuid, appProblems);
    });
}

function initDiagnosticReporter(uuid: string, appProblems: Set<string>) {
    const appsTree = System.getAllWindows()
        .map(
            (app: AppDiagnosticData) => ({
                uuid: app.uuid,
                mainWindowName: app.mainWindow.name,
                isShowing: app.mainWindow.isShowing,
                childWindows: getChildWinDiagnosticInfo(app.childWindows)
            })
        );

    const cpuUsage = System.getProcessList()
        .filter((proc: any) => proc.uuid === uuid)
        .map((proc: any) => proc.cpuUsage);
    const memoryStats = process.memoryUsage();

    writeToLog('info', buildLogString({ uuid, appProblems, appsTree, memoryStats, cpuUsage }));
}

function getChildWinDiagnosticInfo(childWindows: WinDiagnosticData[]) {
    return childWindows.map(win => JSON.stringify({ name: win.name, isShowing: win.isShowing })).join(', ');
}

function buildLogString({
    uuid,
    appProblems,
    appsTree,
    memoryStats,
    cpuUsage
}: any): string {

    const problemsStr = appProblems.size ?
        `-- Problems: ${[...appProblems].join('\n')}` : ``;

    const treeStr = appsTree.length ?
        `${appsTree.map((item: WinDiagnosticData) => JSON.stringify(item)).join('\n\t\t')}` : ``;

    const memoryStr = Object.keys(memoryStats)
        .map(key => `${key}: ${(Number.parseFloat(memoryStats[key]) * 1e-6).toFixed(2)} MB`)
        .join('\n\t\t');

    const cpuStr = cpuUsage !== undefined ?
        cpuUsage.toString() + '%' : ``;

    return `

    ****** Diagnostic Report for current runtime ********

        Resource usage
            -- Memory:
                ${memoryStr}
            -- CPU:
                ${cpuStr}

        Applications:
            ${treeStr}

        Current app errors
        ${problemsStr || 'No errors'}

    ****** End of Diagnostic Report ********
    `;
}

function initEventReporter(uuid: string) {
    const problems = new Set();

    ofEvents.on(route.window('not-responding', '*'), (payload) => {
        problems.add('not-responding');
        writeToLog('info', `Window is not responding. uuid: ${payload.data[0].uuid}, name: ${payload.data[0].name}`);
    });
    ofEvents.on(route.window('responding', '*'), (payload) => {
        problems.delete('not-responding');
        writeToLog('info', `Window responding again. uuid: ${payload.data[0].uuid}, name: ${payload.data[0].name}`);
    });

    return problems;
}