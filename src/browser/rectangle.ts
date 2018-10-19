import * as log from './log';
const l = (x: any) => log.writeToLog(1, x, true);

type SideName = 'top' | 'right' | 'bottom' | 'left';

interface Opts {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
}

// todo, does this make sense?
class RectOptionsOpts {
    public minWidth?: number;
    public maxWidth?: number;
    public minHeight?: number;
    public maxHeight?: number;

    constructor(opts: Opts) {
        // when resizing, dont let the window get so small you cant see it / grab it
        this.minWidth = Math.max(opts.minWidth || 10, 10);
        this.maxWidth = opts.maxWidth || Number.MAX_SAFE_INTEGER;
        this.minHeight = Math.max(opts.maxHeight || 10, 10);
        this.maxHeight = opts.maxHeight || Number.MAX_SAFE_INTEGER;
    }
}

export interface RectangleBase {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class Rectangle {
    public static CREATE_FROM_BOUNDS(rect: RectangleBase, opts: Opts = {}): Rectangle {
        const { x, y, width, height } = rect;
        return new Rectangle(x, y, width, height, new RectOptionsOpts(opts));
    }

    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public opts: Opts;
    public boundShareThreshold = 5;

    // todo check the constructor here...
    constructor (x: number, y: number, width: number, height: number, opts: Opts = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.opts = new RectOptionsOpts(opts);
    }

    get right(): number {
        return this.x + this.width;
    }

    get bottom(): number {
        return this.y + this.height;
    }

    get top() {
        return this.y;
    }

    get left() {
        return this.x;
    }

    // public hasAdjacentEdge (r: Rectangle): { hasAdjacency: boolean, sharedEdge: string } {
    //     const intersectionRect = this.intersection(r.grow(5, 5));

    //     const intersection = !intersectionRect.isEmpty();

    //     if (!intersection) { return { hasAdjacency: false, sharedEdge: null }; }

    // }

    // tslint:disable 
    public grow(h: number, v: number): Rectangle {
        let x0: number = this.x;
        let y0: number = this.y;
        let x1: number = this.width;
        let y1: number = this.height;
        x1 += x0;
        y1 += y0;

        x0 -= h;
        y0 -= v;
        x1 += h;
        y1 += v;

        if (x1 < x0) {
            // Non-existant in X direction
            // Final width must remain negative so subtract x0 before
            // it is clipped so that we avoid the risk that the clipping
            // of x0 will reverse the ordering of x0 and x1.
            x1 -= x0;
            if (x1 < Number.MIN_VALUE) x1 = Number.MIN_VALUE;
            if (x0 < Number.MIN_VALUE) x0 = Number.MIN_VALUE;
            else if (x0 > Number.MAX_VALUE) x0 = Number.MAX_VALUE;
        } else { // (x1 >= x0)
            // Clip x0 before we subtract it from x1 in case the clipping
            // affects the representable area of the rectangle.
            if (x0 < Number.MIN_VALUE) x0 = Number.MIN_VALUE;
            else if (x0 > Number.MAX_VALUE) x0 = Number.MAX_VALUE;
            x1 -= x0;
            // The only way x1 can be negative now is if we clipped
            // x0 against MIN and x1 is less than MIN - in which case
            // we want to leave the width negative since the result
            // did not intersect the representable area.
            if (x1 < Number.MIN_VALUE) x1 = Number.MIN_VALUE;
            else if (x1 > Number.MAX_VALUE) x1 = Number.MAX_VALUE;
        }

        if (y1 < y0) {
            // Non-existant in Y direction
            y1 -= y0;
            if (y1 < Number.MIN_VALUE) y1 = Number.MIN_VALUE;
            if (y0 < Number.MIN_VALUE) y0 = Number.MIN_VALUE;
            else if (y0 > Number.MAX_VALUE) y0 = Number.MAX_VALUE;
        } else { // (y1 >= y0)
            if (y0 < Number.MIN_VALUE) y0 = Number.MIN_VALUE;
            else if (y0 > Number.MAX_VALUE) y0 = Number.MAX_VALUE;
            y1 -= y0;
            if (y1 < Number.MIN_VALUE) y1 = Number.MIN_VALUE;
            else if (y1 > Number.MAX_VALUE) y1 = Number.MAX_VALUE;
        }

        return new Rectangle(x0, y0, x1, y1);
    }
    
    public isEmpty(): boolean {
        return (this.width <= 0.0001) || (this.height <= 0.0001);
    }

    // todo revisit this for external monitor 
    public intersection(r: Rectangle): Rectangle {
        let tx1: number = this.x;
        let ty1: number = this.y;
        const rx1: number = r.x;
        const ry1: number = r.y;
        let tx2: number = tx1; tx2 += this.width;
        let ty2: number = ty1; ty2 += this.height;
        let rx2: number = rx1; rx2 += r.width;
        let ry2: number = ry1; ry2 += r.height;
        if (tx1 < rx1) tx1 = rx1;
        if (ty1 < ry1) ty1 = ry1;
        if (tx2 > rx2) tx2 = rx2;
        if (ty2 > ry2) ty2 = ry2;
        tx2 -= tx1;
        ty2 -= ty1;
        // tx2,ty2 will never overflow (they will never be
        // larger than the smallest of the two source w,h)
        // they might underflow, though...
        if (tx2 < Number.MIN_VALUE) tx2 = Number.MIN_VALUE;
        if (ty2 < Number.MIN_VALUE) ty2 = Number.MIN_VALUE;
        return new Rectangle(tx1, ty1, tx2, ty2);
    }
    // ts-lint:enable


    // note this does not match both... just note it
    private sharedBound(side: SideName, rect: Rectangle): SideName {
        let delta: SideName;
        let oppositeDelta: SideName;

        switch (side) {
            case "top":
            case "bottom": {
                delta = 'top';
                oppositeDelta = 'bottom'
            } break;
            case "left":
            case "right": {
                delta = 'left';
                oppositeDelta = 'right';
            }
        }

        if (Math.abs(this[side] - rect[delta]) <= this.boundShareThreshold) {
            return delta;
        }

        if (Math.abs(this[side] - rect[oppositeDelta]) <= this.boundShareThreshold) {
            return oppositeDelta;
        }

        return null;
    }



    public sharedBounds(rect: Rectangle): {hasSharedBounds: boolean, top: string, right: string, bottom: string, left: string} {
        const intersectionRect = this.intersection(rect.grow(this.boundShareThreshold, this.boundShareThreshold));
        const intersection = !intersectionRect.isEmpty();

        l('ogging')
        l(rect);
    
        l(this);

        let hasSharedBounds = false;
        let top: string = null;
        let right: string = null;
        let bottom: string = null;
        let left: string = null;

        if (!intersection) {
            return {hasSharedBounds, top, right, bottom, left};
        }

        // what about if the top and bottom are in the same range... a super small window
        top = this.sharedBound('top', rect);
        right = this.sharedBound('right', rect);
        bottom = this.sharedBound('bottom', rect);
        left = this.sharedBound('left', rect);

        hasSharedBounds = !!(top || right || bottom || left);

        return {hasSharedBounds, top, right, bottom, left};
    }

    public sharedBoundsList(rect: Rectangle) {
        const sides: Array<SideName> = ['top', 'right', 'left', 'bottom'];
        const sharedBounds = this.sharedBounds(rect);

        return sides.map(side => {
            const correspondingSide = sharedBounds[side];
            let pair;

            if (correspondingSide) {
                return [side, correspondingSide]
            }

            return pair;
        }).filter(x => x);
    }

    public delta(rect: Rectangle): RectangleBase {
        return {
            x: rect.x - this.x,
            y: rect.y - this.y,
            width: rect.width - this.width,
            height: rect.height - this.height
        }
    }
}