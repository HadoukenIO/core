
export type msecs = number;
export type secs = number;

export class Timer {

    private startTime: msecs;

    public static format: string = '#.###';

    constructor() {
        this.reset();
    }

    public reset(): void {
        this.startTime = Date.now();
    }

    get msecs(): msecs {
        return Date.now() - this.startTime;
    }

    get secs(): secs {
        return this.msecs / 1000;
    }

    public toString(format: string = Timer.format): string {
        const match: string[] = format.match(/#+(\.#+)?/);
        let result = this.secs.toFixed(match ? match[1].length - 1 : 0);
        if (match) {
            result = format.replace(match[0], result);
        }
        return result;
    }

}
