import { BrowserWindow } from '../shapes';

type SideName = 'top' | 'right' | 'bottom' | 'left';
type SharedBounds = {
    hasSharedBounds: boolean;
    top: SideName;
    right: SideName;
    bottom: SideName;
    left: SideName;
};
type SharedBound = Array<SideName>;
type BoundIdentifier = [Rectangle, SideName];
type RectangleBaseKeys = 'x' | 'y' | 'width' | 'height';
export type SharedBoundsList = Array<SharedBound>;

interface Opts {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
}

export interface RectangleBase {
    x: number;
    y: number;
    width: number;
    height: number;
}

class RectOptionsOpts {
    public minWidth?: number;
    public maxWidth?: number;
    public minHeight?: number;
    public maxHeight?: number;

    constructor(opts: Opts) {
        // when resizing, dont let the window get so small you cant see it / grab it
        this.minWidth = Math.max(opts.minWidth || 48, 48);
        this.maxWidth = opts.maxWidth || Number.MAX_SAFE_INTEGER;
        this.minHeight = Math.max(opts.minHeight || 38, 38);
        this.maxHeight = opts.maxHeight || Number.MAX_SAFE_INTEGER;
    }
}

export class Rectangle {
    public static CREATE_FROM_BOUNDS(rect: RectangleBase, opts: Opts = {}): Rectangle {
        const { x, y, width, height } = rect;
        return new Rectangle(x, y, width, height, new RectOptionsOpts(opts));
    }
    public static CREATE_FROM_BROWSER_WINDOW(win: BrowserWindow) {
        return Rectangle.CREATE_FROM_BOUNDS(win.getBounds(), win._options);
    }

    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public opts: Opts;
    public boundShareThreshold = 5;

    constructor(x: number, y: number, width: number, height: number, opts: Opts = {}) {
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
    get transactionBounds() {
        return {
            x: this.x,
            y: this.y,
            w: this.width,
            h: this.height
        };
    }

    // tslint:disable 
    public grow(h: number, v: number): Rectangle {
        let x: number = this.x;
        let y: number = this.y;
        let width: number = this.width;
        let height: number = this.height;

        width += x;
        height += y;

        x -= h;
        y -= v;
        width += h;
        height += v;

        if (width < x) {
            width -= x;
            if (width < Number.MIN_SAFE_INTEGER) width = Number.MIN_SAFE_INTEGER;
            if (x < Number.MIN_SAFE_INTEGER) x = Number.MIN_SAFE_INTEGER;
            else if (x > Number.MAX_VALUE) x = Number.MAX_VALUE;
        } else {
            if (x < Number.MIN_SAFE_INTEGER) x = Number.MIN_SAFE_INTEGER;
            else if (x > Number.MAX_VALUE) x = Number.MAX_VALUE;
            width -= x;
            if (width < Number.MIN_SAFE_INTEGER) width = Number.MIN_SAFE_INTEGER;
            else if (width > Number.MAX_VALUE) width = Number.MAX_VALUE;
        }

        if (height < y) {
            height -= y;
            if (height < Number.MIN_SAFE_INTEGER) height = Number.MIN_SAFE_INTEGER;
            if (y < Number.MIN_SAFE_INTEGER) y = Number.MIN_SAFE_INTEGER;
            else if (y > Number.MAX_VALUE) y = Number.MAX_VALUE;
        } else {
            if (y < Number.MIN_SAFE_INTEGER) y = Number.MIN_SAFE_INTEGER;
            else if (y > Number.MAX_VALUE) y = Number.MAX_VALUE;
            height -= y;
            if (height < Number.MIN_SAFE_INTEGER) height = Number.MIN_SAFE_INTEGER;
            else if (height > Number.MAX_VALUE) height = Number.MAX_VALUE;
        }

        return new Rectangle(x, y, width, height, this.opts);
    }
    // ts-lint:enable

    public collidesWith(rect: RectangleBase) {
        const { x, y, width, height } = rect;
        let collision = false;

        if (this.x < x + width &&
            this.x + this.width > x &&
            this.y < y + height &&
            this.y + this.height > y) {
            collision = true;
        }

        return collision;
    }

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
        const intersectionRect = rect.grow(this.boundShareThreshold, this.boundShareThreshold);
        const intersection = this.collidesWith(intersectionRect);

        let hasSharedBounds = false;
        let top: SideName = null;
        let right: SideName = null;
        let bottom: SideName = null;
        let left: SideName = null;

        if (!intersection) {
            return { hasSharedBounds, top, right, bottom, left };
        }

        top = this.sharedBound('top', rect);
        right = this.sharedBound('right', rect);
        bottom = this.sharedBound('bottom', rect);
        left = this.sharedBound('left', rect);

        hasSharedBounds = !!(top || right || bottom || left);

        return { hasSharedBounds, top, right, bottom, left };
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

    public delta(rect: RectangleBase): RectangleBase {
        return {
            x: rect.x - this.x,
            y: rect.y - this.y,
            width: rect.width - this.width,
            height: rect.height - this.height
        }
    }
    public outerBounds(rect: RectangleBase) {
        return {
            x: Math.min(rect.x, this.x),
            y: Math.min(rect.y, this.y),
            width: Math.max(rect.width, this.width),
            height: Math.max(rect.height, this.height)
        }
    }

    // this is only for resize, move would be different
    private edgeMoved(pair: Array<SideName>, delta: RectangleBase): boolean {
        const { x, y, width, height } = delta;
        const [mySide, otherRectSharedSide] = pair;

        const movedSides: Set<SideName> = new Set();
        if (!x && width) { movedSides.add('right'); }
        if (x && width) { movedSides.add('left'); }
        if (!y && height) { movedSides.add('bottom'); }
        if (y && height) { movedSides.add('top'); }

        return movedSides.has(otherRectSharedSide);
    }


    public alignSide(mySide: SideName, rect: Rectangle, sideToAlign: SideName) {
        const changes = this.bounds;
        switch (mySide) {
            case "left":
                changes.width += (this.x - rect[sideToAlign]);
                changes.x = rect[sideToAlign];
                if (changes.width < this.opts.minWidth) {
                    changes.width = this.opts.minWidth;
                }
                break;
            case "right":
                changes.width += (rect[sideToAlign] - (this.x + this.width));
                if (changes.width < this.opts.minWidth) {
                    changes.x = rect[sideToAlign] - this.opts.minWidth;
                    changes.width = this.opts.minWidth;
                }
                break;
            case "top":
                changes.height += (this.y - rect[sideToAlign]);
                changes.y = rect[sideToAlign];
                if (changes.height < this.opts.minHeight) {
                    changes.height = this.opts.minHeight;
                }
                break;
            case "bottom":
                changes.height += (rect[sideToAlign] - (this.y + this.height));
                if (changes.height < this.opts.minHeight) {
                    changes.y = rect[sideToAlign] - this.opts.minHeight;
                    changes.height = this.opts.minHeight;
                }
                break;
            default:
                return null as never;
        }
        return Rectangle.CREATE_FROM_BOUNDS(changes, this.opts)
    }
    public shift(delta: RectangleBase) {
        return new Rectangle(this.x + delta.x, this.y + delta.y, this.width + delta.width, this.height + delta.height, this.opts);
    }

    public move(cachedBounds: RectangleBase, currentBounds: RectangleBase) {
        const sharedBoundsList = this.sharedBoundsList(Rectangle.CREATE_FROM_BOUNDS(cachedBounds));
        const currLeader = Rectangle.CREATE_FROM_BOUNDS(currentBounds);
        const delta = Rectangle.CREATE_FROM_BOUNDS(cachedBounds).delta(currLeader);
        let rect: Rectangle = this;
        for (let [thisRectSharedSide, otherRectSharedSide] of sharedBoundsList) {
            if (rect.edgeMoved([thisRectSharedSide, otherRectSharedSide], delta)) {
                rect = rect.alignSide(thisRectSharedSide, currLeader, otherRectSharedSide);
            }
        }

        return rect;
    }
    public adjacent(rects: Rectangle[]) {
        return Array.from(Rectangle.ADJACENCY_LIST([...rects, this as Rectangle]).values()).find(list => list.includes(this));
    }

    public static ADJACENCY_LIST(rects: Rectangle[]): Map<number, Rectangle[]> {
        const adjLists = new Map();
        const rectLen = rects.length;

        for (let i = 0; i < rectLen; i++) {
            const adjacentRects = [];
            const rect = rects[i];

            for (let ii = 0; ii < rectLen; ii++) {
                if (i !== ii) {
                    if (rect.sharedBounds(rects[ii]).hasSharedBounds) {
                        adjacentRects.push(ii);
                    }
                }
            }

            adjLists.set(i, adjacentRects);
        }

        return adjLists;
    }
}
