import * as log from './log';
const l = (x: any) => log.writeToLog(1, x, true);

// import * as log from './log';
// const l = (x: any) => console.log.writeToLog(1, x, true);

type SideName = 'top' | 'right' | 'bottom' | 'left';
type SharedBound = Array<SideName>;
export type SharedBoundsList = Array<SharedBound>;
type SharedBounds = {
    hasSharedBounds: boolean;
    top: SideName;
    right: SideName;
    bottom: SideName;
    left: SideName;
};

interface Opts {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
}

type RectangleBaseKeys = 'x' | 'y' | 'width' | 'height';

export interface RectangleBase {
    x: number;
    y: number;
    width: number;
    height: number;
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

    get bounds(): RectangleBase {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

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



    public sharedBounds(rect: Rectangle): SharedBounds {
        const intersectionRect = this.intersection(rect.grow(this.boundShareThreshold, this.boundShareThreshold));
        const intersection = !intersectionRect.isEmpty();
        let hasSharedBounds = false;
        let top: SideName = null;
        let right: SideName = null;
        let bottom: SideName = null;
        let left: SideName = null;

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

    public sharedBoundsList(rect: Rectangle): SharedBoundsList {
        const sides: Array<SideName> = ['top', 'right', 'left', 'bottom'];
        const sharedBounds = this.sharedBounds(rect);

        return sides.map(side => {
            const correspondingSide = sharedBounds[side];
            let pair: SharedBound;

            if (correspondingSide) {
                pair = [side, correspondingSide]
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

    // this is only for resize, move would be different
    private edgeMoved(pair: Array<SideName>, delta: RectangleBase): boolean {
        // { "x": 0, "y": 0, "width":  0, "height": -4 }    => bottom
        // { "x": 9, "y": 0, "width": -9, "height":  0 }    => left
        // { "x": 0, "y": 0, "width": -9, "height":  0 }    => right
        const {x, y, width, height } = delta;
        const [mySide, otherRectSharedSide] = pair;

        const movedSides: Set<SideName> = new Set();
        if (!x && width) { movedSides.add('right'); }
        if (x && width) { movedSides.add('left'); }
        if (!y && height) { movedSides.add('bottom'); }
        if (y && height) { movedSides.add('top'); }

        return movedSides.has(otherRectSharedSide);
    }


    public alignSide(mySide: SideName, rect: Rectangle , sideToAlign: SideName) {
        // left is joined to right is different than right is joined to left! 
        l(`$$$$$$$$$$$$$$$$$ mySide: ${mySide}, sideToAlign: ${sideToAlign}`)
        switch (mySide){
            case "left": {
                const xInitial = this.x;
                this.x = rect[sideToAlign];
                this.width += (xInitial - this.x); 
            } break;
            case "right": {
                this.width += (rect[sideToAlign] - (this.x + this.width));
            } break;
            case "top": {
                const yInitial = this.y;
                this.y = rect[sideToAlign];
                this.height += (yInitial - this.y); 
            } break;
            case "bottom": {
                this.height += (rect[sideToAlign] - (this.y + this.height));
            } break;

        }
    }

    public move2(cachedBounds: RectangleBase, currentBounds: RectangleBase) {
        const sharedBoundsList = this.sharedBoundsList(Rectangle.CREATE_FROM_BOUNDS(cachedBounds));
        const currLeader = Rectangle.CREATE_FROM_BOUNDS(currentBounds);
        const delta = Rectangle.CREATE_FROM_BOUNDS(cachedBounds).delta(currLeader);

        for (let [thisRectSharedSide, otherRectSharedSide] of sharedBoundsList) {
            if (this.edgeMoved([thisRectSharedSide, otherRectSharedSide], delta)) {
                this.alignSide(thisRectSharedSide, currLeader, otherRectSharedSide);
            }
        }

        return this.bounds;
    }

    public move(sharedBounds: SharedBoundsList, delta: RectangleBase) {
        const bounds = this.bounds;
        const movementTranslation: MovementTranslation = {
            left: 'x',
            top: 'y',
            right: 'width',
            bottom: 'height'
        };
        const correspondingSide: {[S in SideName]: SideName}= {
            'top': 'bottom',
            'bottom': 'top',
            'right': 'left',
            'left': 'right'
        };

        // console.log(' ');
        // console.log(JSON.stringify(bounds, null, ' '));
        // console.log('.............');
        // console.log(JSON.stringify(delta, null, ' '));

        // tslint:disable
        // console.log(JSON.stringify(movementTranslation, null, ' '));
        for (let [thisRectSharedSide, otherRectSharedSide] of sharedBounds) {
            // console.log(`${thisRectSharedSide}, ${otherRectSharedSide}. ${movementTranslation[thisRectSharedSide]}`);
            const translation = movementTranslation[thisRectSharedSide];
            // console.log(`&&& ${translation}, ${delta[translation]}` );
            /*
                right, left
                {"x":9,"y":0,"width":-9,"height":0}
            */
           // figure out if the side that moves impacts my position
           // LOCATION AND SIZE ARE DIFFERENT AND NEED TO BE HANDLED DIFFERENTLY!!!
           if (this.edgeMoved([thisRectSharedSide, otherRectSharedSide], delta)) {
               const deltaOtherSide = delta[movementTranslation[otherRectSharedSide]];
               const deltaOtherCorrSide = delta[movementTranslation[correspondingSide[otherRectSharedSide]]];
               // console.log(`transition ${translation} (${bounds[translation]}): ${(deltaOtherSide + deltaOtherCorrSide)}`);

            bounds[translation] += deltaOtherSide;

            if (!(thisRectSharedSide === otherRectSharedSide)) {
                bounds[movementTranslation[correspondingSide[thisRectSharedSide]]] += -(deltaOtherSide + deltaOtherCorrSide);
                // console.log('this and that...', movementTranslation[correspondingSide[otherRectSharedSide]], ' ',
                // movementTranslation[correspondingSide[thisRectSharedSide]], -(deltaOtherSide + deltaOtherCorrSide));
            }
           }
        }

        return bounds;
    }

    public static ADJACENCY_LIST(rects: Rectangle[]) {
        const adjLists = new Map();
        const rectLen = rects.length;

        for (let i = 0; i < rectLen; i++) {
            const adjacentRects = [];
            const rect = rects[i];

            for (let ii = 0; ii < rectLen; ii++) {
                if (i !== ii) {
                    if (rect.sharedBounds(rects[ii]).hasSharedBounds) {
                        adjacentRects.push(rects[ii]);
                        adjacentRects.push(ii);
                    }
                }
            }

            adjLists.set(i, adjacentRects);
        }

        return adjLists;
    }
}

// type SideName = 'top' | 'right' | 'bottom' | 'left';
type MovementTranslation = {[S in SideName]: RectangleBaseKeys};

// export interface RectangleBase {
//     x: number;
//     y: number;
//     width: number;
//     height: number;
// }

// interface MovementTranslation {
//     [name: SideName]: SideName;
// }