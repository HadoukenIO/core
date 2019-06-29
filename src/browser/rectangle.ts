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
type Graph = [number[], number[][]];
export interface Opts {
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
type EdgeCrossing = { mine: SideName, other: SideName, distance: number };
export type EdgeCrossings = EdgeCrossing[];

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
const zeroDelta = { x: 0, y: 0, height: 0, width: 0 };

export class Rectangle {
    public static CREATE_FROM_BOUNDS(rect: RectangleBase, opts?: Opts): Rectangle {
        const { x, y, width, height } = rect;
        const options = opts
            ? opts
            : rect instanceof Rectangle
                ? rect.opts
                : {};
        return new Rectangle(x, y, width, height, new RectOptionsOpts(options));
    }
    public static BOUND_SHARE_THRESHOLD = 5;

    private static readonly EDGE_CROSSINGS: SideName[][] = [
        ['top', 'top'],
        ['top', 'bottom'],
        ['bottom', 'top'],
        ['bottom', 'bottom'],
        ['right', 'left'],
        ['right', 'right'],
        ['left', 'left'],
        ['left', 'right']
    ];

    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public opts: Opts;

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
    get bounds() {
        return {
            x: this.x,
            y: this.y,
            height: this.height,
            width: this.width
        };
    }
    // tslint:disable
    public grow = (h: number, v: number): Rectangle => {
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
            if (width < Number.MIN_SAFE_INTEGER) { width = Number.MIN_SAFE_INTEGER; }
            if (x < Number.MIN_SAFE_INTEGER) { x = Number.MIN_SAFE_INTEGER; } else if (x > Number.MAX_VALUE) { x = Number.MAX_VALUE; }
        } else {
            if (x < Number.MIN_SAFE_INTEGER) { x = Number.MIN_SAFE_INTEGER; } else if (x > Number.MAX_VALUE) { x = Number.MAX_VALUE; }
            width -= x;
            if (width < Number.MIN_SAFE_INTEGER) { width = Number.MIN_SAFE_INTEGER; } else if (width > Number.MAX_VALUE) { width = Number.MAX_VALUE; }
        }

        if (height < y) {
            height -= y;
            if (height < Number.MIN_SAFE_INTEGER) { height = Number.MIN_SAFE_INTEGER; }
            if (y < Number.MIN_SAFE_INTEGER) { y = Number.MIN_SAFE_INTEGER; } else if (y > Number.MAX_VALUE) { y = Number.MAX_VALUE; }
        } else {
            if (y < Number.MIN_SAFE_INTEGER) { y = Number.MIN_SAFE_INTEGER; } else if (y > Number.MAX_VALUE) { y = Number.MAX_VALUE; }
            height -= y;
            if (height < Number.MIN_SAFE_INTEGER) { height = Number.MIN_SAFE_INTEGER; } else if (height > Number.MAX_VALUE) { height = Number.MAX_VALUE; }
        }

        return new Rectangle(x, y, width, height, this.opts);
    }
    // ts-lint:enable

    public collidesWith = (rect: RectangleBase) => {
        const { x, y, width, height } = rect;
        let collision = false;

        if (this.x <= x + width &&
            this.x + this.width >= x &&
            this.y <= y + height &&
            this.y + this.height >= y) {
            collision = true;
        }

        return collision;
    }

    // note this does not match both... just note it
    private sharedBound = (side: SideName, rect: Rectangle): SideName => {
        let delta: SideName;
        let oppositeDelta: SideName;

        switch (side) {
            case 'top':
            case 'bottom': {
                delta = 'top';
                oppositeDelta = 'bottom';
            } break;
            case 'left':
            case 'right': {
                delta = 'left';
                oppositeDelta = 'right';
            }
        }

        if (Math.abs(this[side] - rect[delta]) <= Rectangle.BOUND_SHARE_THRESHOLD) {
            return delta;
        }

        if (Math.abs(this[side] - rect[oppositeDelta]) <= Rectangle.BOUND_SHARE_THRESHOLD) {
            return oppositeDelta;
        }

        return null;
    }


    public sharedBounds = (rect: Rectangle): SharedBounds => {
        let top = this.sharedBound('top', rect);
        let right = this.sharedBound('right', rect);
        let bottom = this.sharedBound('bottom', rect);
        let left = this.sharedBound('left', rect);
        let hasSharedBounds = !!(top || right || bottom || left);

        return { hasSharedBounds, top, right, bottom, left };
    }


    public sharedBoundsOnIntersection = (rect: Rectangle): SharedBounds => {
        const growth = Rectangle.BOUND_SHARE_THRESHOLD;
        const intersectionRect = rect.grow(growth, growth);
        const intersection = this.collidesWith(intersectionRect);

        let hasSharedBounds = false;
        let top: SideName = null;
        let right: SideName = null;
        let bottom: SideName = null;
        let left: SideName = null;

        if (!intersection) {
            return { hasSharedBounds, top, right, bottom, left };
        } else {
            return this.sharedBounds(rect);
        }
    }

    public sharedBoundsList = (rect: Rectangle): SharedBoundsList => {
        const sides: Array<SideName> = ['top', 'right', 'left', 'bottom'];
        const sharedBounds = this.sharedBounds(rect);

        return sides.map(side => {
            const correspondingSide = sharedBounds[side];
            let pair: SharedBound;

            if (correspondingSide) {
                pair = [side, correspondingSide];
            }

            return pair;
        }).filter(x => x);
    }

    public moved = (rect: RectangleBase) => {
        return !(
            rect.x === this.x
            && rect.y === this.y
            && rect.height === this.height
            && rect.width === this.width
        )
    }

    public delta = (rect: RectangleBase): RectangleBase => {
        return {
            x: rect.x - this.x,
            y: rect.y - this.y,
            width: rect.width - this.width,
            height: rect.height - this.height
        };
    }

    public outerBounds = (rect: RectangleBase) => {
        return {
            x: Math.min(rect.x, this.x),
            y: Math.min(rect.y, this.y),
            width: Math.max(rect.width, this.width),
            height: Math.max(rect.height, this.height)
        };
    }

    // this is only for resize, move would be different
    private edgeMoved = (pair: Array<SideName>, delta: RectangleBase): boolean => {
        const { x, y, width, height } = delta;
        const [mySide, otherRectSharedSide] = pair;

        const movedSides: Set<SideName> = new Set();
        if (!x && width) {
            movedSides.add('right');
        }
        if (x && width) {
            movedSides.add('left');
        }
        if (!y && height) {
            movedSides.add('bottom');
        }
        if (y && height) {
            movedSides.add('top');
        }
        if (y && !height) {
            movedSides.add(otherRectSharedSide);
        }
        if (x && !width) {
            movedSides.add(otherRectSharedSide);
        }

        return movedSides.has(otherRectSharedSide);
    }


    public alignSide = (mySide: SideName, rect: Rectangle, sideToAlign: SideName) => {
        const changes = this.bounds;
        switch (mySide) {
            case 'left': {
                    changes.width += (this.x - rect[sideToAlign]);

                    const tooSmall = changes.width < this.opts.minWidth;
                    const tooBig = changes.width > this.opts.maxWidth;

                    changes.x = rect[sideToAlign];

                    if (tooSmall) {
                        changes.width = this.opts.minWidth;
                    } else if (tooBig) {
                        changes.width = this.opts.maxWidth;
                    }
                }
                break;
            case 'right': {
                    changes.width += (rect[sideToAlign] - (this.x + this.width));
                    if (changes.width < this.opts.minWidth) {
                        // prevent 'pushing' a window via the resizing of another
                        changes.x = rect[sideToAlign] - this.opts.minWidth;
                        changes.width = this.opts.minWidth;
                    } else if (changes.width > this.opts.maxWidth) {
                        // prevent 'pulling' a window via the resizing of another
                        changes.x = rect[sideToAlign] - this.opts.maxWidth;
                        changes.width = this.opts.maxWidth;
                    }
                }
                break;
            case 'top': {
                    changes.height += (this.y - rect[sideToAlign]);

                    const tooSmall = changes.height < this.opts.minHeight;
                    const tooBig = changes.height > this.opts.maxHeight;

                    changes.y = rect[sideToAlign];      

                    if (tooSmall) {
                        changes.height = this.opts.minHeight;
                    } else if (tooBig) {
                        changes.height = this.opts.maxHeight;
                    }
                }
                break;
            case 'bottom': {
                    changes.height += (rect[sideToAlign] - (this.y + this.height));
                    if (changes.height < this.opts.minHeight) {
                        // prevent 'pushing' a window via the resizing of another
                        changes.y = rect[sideToAlign] - this.opts.minHeight;
                        changes.height = this.opts.minHeight;
                    } else if (changes.height > this.opts.maxHeight) {
                        // prevent "pulling" a window via the resizing of another
                        changes.y = rect[sideToAlign] - this.opts.maxHeight;
                        changes.height = this.opts.maxHeight;
                    }
                }
                break;
            default:
                return null as never;
        }
        return Rectangle.CREATE_FROM_BOUNDS(changes, this.opts);
    }

    public shift = (delta: RectangleBase) => {
        return new Rectangle(this.x + delta.x, this.y + delta.y, this.width + delta.width, this.height + delta.height, this.opts);
    }

    public move = (cachedBounds: RectangleBase, currentBounds: RectangleBase): Rectangle => {
        
        const sharedBoundsList = this.sharedBoundsList(Rectangle.CREATE_FROM_BOUNDS(cachedBounds));
        const currLeader = Rectangle.CREATE_FROM_BOUNDS(currentBounds);
        const delta = Rectangle.CREATE_FROM_BOUNDS(cachedBounds).delta(currLeader);
        let rect: Rectangle = this;
        for (const [thisRectSharedSide, otherRectSharedSide] of sharedBoundsList) {
            if (rect.edgeMoved([thisRectSharedSide, otherRectSharedSide], delta)) {
                rect = rect.alignSide(thisRectSharedSide, currLeader, otherRectSharedSide);
            }
        }

        return rect;
    }

    public adjacent = (rects: Rectangle[]) => {
        return Array.from(Rectangle.ADJACENCY_LIST([...rects, this as Rectangle]).values()).find(list => list.includes(this));
    }

    public hasIdenticalBounds = (rect: RectangleBase): boolean => {
        return this.x === rect.x &&
            this.y === rect.y &&
            this.width === rect.width &&
            this.height === rect.height;
    }

    public static ADJACENCY_LIST(rects: Rectangle[]): Map<number, Rectangle[]> {
        const adjLists = new Map();
        const rectLen = rects.length;

        for (let i = 0; i < rectLen; i++) {
            const adjacentRects = [];
            const rect = rects[i];

            for (let ii = 0; ii < rectLen; ii++) {
                if (i !== ii) {
                    if (rect.sharedBoundsOnIntersection(rects[ii]).hasSharedBounds) {
                        adjacentRects.push(ii);
                    }
                }
            }

            adjLists.set(i, adjacentRects);
        }

        return adjLists;
    }

    public static GRAPH_WITH_SIDE_DISTANCES(rects: Rectangle[]) {
        const edges: Set<string> = new Set();
        const edgeDistances: Map<string, number> = new Map();
        const vertices: Set<number> = new Set();
        const rectLen = rects.length;

        for (let i = 0; i < rectLen; i++) {
            const rect = rects[i];
            vertices.add(i);

            for (let ii = 0; ii < rectLen; ii++) {
                if (i !== ii) {

                    if (rect.sharedBoundsOnIntersection(rects[ii]).hasSharedBounds) {
                        const sharedBoundsList = rect.sharedBoundsList(rects[ii]);

                        sharedBoundsList.forEach((sides) => {
                            const [mySide, otherSide] = sides;
                            const key = [i, ii, Side[mySide], Side[otherSide]].toString();
                            edges.add(key)
                            edgeDistances.set(key, Math.abs(rect[mySide] - rects[ii][otherSide]));
                        });
                    }
                }
            }
        }

        return { vertices, edges, edgeDistances };
    }

    /**
     * This indicates that not only is `a` a subgraph of `b` but that, if there was 
     * any difference in distances that they are equal or closer
     */
    public static SUBGRAPH_AND_CLOSER(a: any, b: any) {
        for (const v of a.vertices) {
            if (!b.vertices.has(v)) {
                return false;
            }
        }

        for (const e of a.edges) {
            if (!b.edges.has(e)) {
                return false;
            } else if (b.edgeDistances.get(e) > a.edgeDistances.get(e)) {
                return false;
            }
        }

        return true;
    }

    public static sharedBoundValidator(rect1: Rectangle, rect2: Rectangle): boolean {
        return rect1.sharedBoundsOnIntersection(rect2).hasSharedBounds
    }

    public static collisionsValidator(rect1: Rectangle, rect2: Rectangle): boolean  {
        return rect1.collidesWith(rect2);
    }


    public static PROPAGATE_MOVE(leaderRectIndex: number,
        start: Rectangle,
        delta: RectangleBase,
        rects: Rectangle[]): Rectangle[] {

        const graphInitial = Rectangle.GRAPH_WITH_SIDE_DISTANCES(rects);
        const maxDelta = Object.keys(delta).reduce((prev: number, curr: keyof RectangleBase) => {
            const diff = Math.abs(delta[curr]);
            return diff > prev ? diff : prev;
        }, 1);
        const iterator = Math.ceil(maxDelta / Rectangle.BOUND_SHARE_THRESHOLD);
        const iterDelta: RectangleBase = {
            x: Math.round(delta.x / iterator),
            y: Math.round(delta.y / iterator),
            width: Math.round(delta.width / iterator),
            height: Math.round(delta.height / iterator)
        };
        let iterStart = start;
        let iterEnd = iterStart.shift(iterDelta);
    
        for (let i = 0; i < iterator; i++) {
            const lastValidMoves = [...rects];
            rects = propMoveThroughGraph(
                rects,
                leaderRectIndex,
                Rectangle.CREATE_FROM_BOUNDS(iterStart),
                Rectangle.CREATE_FROM_BOUNDS(iterEnd));
    
            iterStart = iterEnd;
            iterEnd = iterEnd.shift(iterDelta);
    
            const graphFinal = Rectangle.GRAPH_WITH_SIDE_DISTANCES(rects);
            if (!Rectangle.SUBGRAPH_AND_CLOSER(graphInitial, graphFinal)) {
                rects = lastValidMoves;
                break;
            }
        }

        return rects;
    }
    
    public static GRAPH(rects: Rectangle[], validator = Rectangle.sharedBoundValidator): Graph  {
        const edges = [];
        const vertices: Array<number> = [];
        const rectLen = rects.length;

        for (let i = 0; i < rectLen; i++) {
            const rect = rects[i];
            vertices.push(i);

            for (let ii = 0; ii < rectLen; ii++) {
                if (i !== ii) {
                    if (validator(rects[i], rects[ii])) {
                        edges.push([i, ii]);
                    }
                }
            }
        }

        return [vertices, edges];
    }

    public static DISTANCES(graph: (number[] | number[][])[] , refV: number) {
        const [vertices, edges] = graph;
        const distances = new Map();

        for (let v in vertices) {
            distances.set(+v, Infinity);
        }

        distances.set(refV, 0);

        const toVisit = [refV];

        while (toVisit.length) {
            const u = toVisit.shift();

            const e = (<number [][]>edges).filter(([uu]): boolean => uu === u);

            e.forEach(([u, v]) => {
                if (distances.get(v) === Infinity) {
                    toVisit.push(v);
                    distances.set(v, distances.get(u) + 1);
                }
            });
        }

        return distances;
    }

    // todo change with recursive walk
    public static BREADTH_WALK(graph: (number[] | number[][])[] , refV: number) {
        const [vertices, edges] = graph;
        const distances = new Map();

        for (let v in vertices) {
            distances.set(+v, []);
        }

        distances.set(refV, [refV]);

        const toVisit = [refV];

        while (toVisit.length) {
            const u = toVisit.shift();

            const e = (<number [][]>edges).filter(([uu]): boolean => uu === u);

            e.forEach(([u, v]) => {
                if (distances.get(v).slice(-1)[0] !== v) {
                    toVisit.push(v);
                    const d = distances.get(u).concat(distances.get(v));

                    d.push(v);
                    distances.set(v, d);
                }
            });
        }

        return distances;
    }
}

function propMoveThroughGraph (
    rects: Rectangle[], 
    refVertex: number, 
    cachedBounds: Rectangle, 
    proposedBounds: Rectangle,
    visited: number[] = []): Rectangle [] {

    const graph = Rectangle.GRAPH(rects);
    const [vertices, edges] = graph;
    const distances = new Map();
    let movedRef = rects[refVertex];

    if (movedRef.hasIdenticalBounds( cachedBounds)) {
        movedRef = Rectangle.CREATE_FROM_BOUNDS(proposedBounds);
    } else {
        movedRef = movedRef.move(cachedBounds, proposedBounds);
    }

    for (let v in vertices) {
        distances.set(+v, Infinity);
    }

    distances.set(refVertex, 0);
    visited.push(refVertex);

    const toVisit = [refVertex];

    while (toVisit.length) {
        const u = toVisit.shift();
        const e = (<number [][]>edges).filter(([uu]): boolean => uu === u);

        e.forEach(([u, v]) => {
            if (!visited.includes(v)) {
                if (distances.get(v) === Infinity) {
                    toVisit.push(v);
                    distances.set(v, distances.get(u) + 1);
                    
                    propMoveThroughGraph(rects, v, rects[refVertex], movedRef, visited);
                    visited.push(v);
                }
            }
        });
    }

    rects[refVertex] = movedRef;
    return rects;
}

enum Side {
    top,
    right,
    bottom,
    left
}
