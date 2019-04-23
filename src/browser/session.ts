import { EventEmitter } from 'events';
import { BrowserWindow, app, idleState, nativeTimer, systemPreferences } from 'electron';

class Session extends EventEmitter {
    private idleState: idleState;
    private idleEventTimer: nativeTimer;
    private checkIdleStateTimer: nativeTimer;
    private idleStartTime: number;
    private idleEndTime: number;

    constructor() {
        super();

        this.idleState = new idleState();

        // Idle event timer
        this.idleEventTimer = new nativeTimer(() => {
            // NOTE: an idle event needs to be fired every minute while the machine is idle.
            // Manually setting the elapsed time here in the case where the screen is locked
            // and the mouse or keyboard is being used
            this.fireIdleEvent(true, app.getTickCount() - this.idleStartTime);
        }, 60000);

        // stop the idle event timer right away until it's needed
        this.idleEventTimer.stop();

        // This timer checks for the machine going into an idle state every second
        this.checkIdleStateTimer = new nativeTimer(() => {
            const isIdle = this.idleState.isIdle();
            const isTimerRunning = this.idleEventTimer.isRunning();
            const timeNow = app.getTickCount() - this.idleState.elapsedTime();

            if (isIdle && !isTimerRunning) {
                this.idleStartTime = timeNow;
                this.fireIdleEvent(true);
                this.idleEventTimer.reset();
            } else if (!isIdle && isTimerRunning) {
                this.idleEndTime = timeNow;
                this.fireIdleEvent(false, this.idleEndTime - this.idleStartTime);
                this.idleEventTimer.stop();
            }
        }, 1000);

        // Immediately reset the timer
        this.checkIdleStateTimer.reset();

        // Windows-only
        if (process.platform === 'win32') {
            const bw = new BrowserWindow({ show: false });
            const WM_WTSSESSION_CHANGE = 0x02B1;

            // Listen to session changes using hidden Electron's browser window
            bw.hookWindowMessage(WM_WTSSESSION_CHANGE, (wParam: any) => {
                let reason: string;

                switch (wParam.readIntLE()) {
                    case 3:
                        reason = 'remote-connect';
                        break;

                    case 4:
                        reason = 'remote-disconnect';
                        break;

                    case 7:
                        reason = 'lock';
                        this.handleLock(true);
                        break;

                    case 8:
                        reason = 'unlock';
                        this.handleLock(false);
                        break;

                    default:
                        reason = 'unknown';
                        break;
                }

                this.fireSessionEvent(reason);
            });

            bw.subscribeSessionNotifications(true);
        } else if (process.platform === 'darwin') {
            systemPreferences.subscribeNotification('com.apple.screenIsLocked', () => {
                this.handleLock(true);
                this.fireSessionEvent('lock');
            });

            systemPreferences.subscribeNotification('com.apple.screenIsUnlocked', () => {
                this.handleLock(false);
                this.fireSessionEvent('unlock');
            });
        }
    }

    /**
     * Send out an event that lets subscribers know that the idle state
     * of the machine has been changed
     */
    private fireIdleEvent(isIdle: boolean, elapsedTime?: number): void {
        this.emit('idle-state-changed', {
            elapsedTime: elapsedTime || this.idleState.elapsedTime(),
            isIdle,
            topic: 'system',
            type: 'idle-state-changed'
        });
    }

    /**
     * Send out an event that lets subscribers know that the session state
     * of the machine has been changed
     */
    private fireSessionEvent(reason: string): void {
        this.emit('session-changed', {
            reason,
            topic: 'system',
            type: 'session-changed'
        });
    }

    /**
     * deal with the lock and unlock event
     * NOTE: when the screen is locked, the machine is considered idle.
     * there is no need for the checkIdleStateTimer until the screen is unlocked
     */
    private handleLock(locked: boolean): void {
        if (locked) {
            this.checkIdleStateTimer.stop();

            if (!this.idleEventTimer.isRunning()) {
                this.idleStartTime = app.getTickCount();
                this.fireIdleEvent(true);
                this.idleEventTimer.reset();
            }
        } else {
            this.idleEventTimer.stop();

            this.idleEndTime = app.getTickCount();
            this.fireIdleEvent(false, this.idleEndTime - this.idleStartTime);
            this.checkIdleStateTimer.reset();
        }
    }
}

export default new Session();
