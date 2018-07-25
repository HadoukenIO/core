class IntPool {
    public currInt: number;
    public releasedBuffer: number[];

    constructor() {
        this.currInt = 1;
        this.releasedBuffer = [];
    }

    /**
     * Returns an integer. Gets it from either a previously
     * released pool of integers, or by creating a new one
     */
    public next(): number {
        let next: number;

        if (this.releasedBuffer.length) {
            next = this.releasedBuffer.shift();
        } else {
            next = this.currInt;
            this.currInt += 1;
        }

        return next;
    }

    /**
     * Releases an integer. Puts in a pool of released
     * integers, if it's not there yet.
     */
    public release(releasedInt: number): void {
        if (this.releasedBuffer.indexOf(releasedInt) === -1) {
            this.releasedBuffer.push(releasedInt);
            this.releasedBuffer.sort();
        }
    }
}

export default new IntPool();