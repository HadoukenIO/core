import * as assert from 'assert';
import * as mockery from 'mockery';

import {mockElectron} from './electron';

mockery.registerMock('electron', mockElectron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});
import { Rectangle, SharedBoundsList } from '../src/browser/rectangle';

describe('Rectangle', () => {
    it('should provide the correct sizes', () => {
        const rect = new Rectangle(0, 0, 100, 100);
        assert(rect.right === 100, 'should compute the right edge');
        assert(rect.bottom === 100, 'should have computed the bottom');
    });

    it('should return the shared bounds within threshold, above', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 97, 100, 100);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the shared bounds within threshold, below', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 104, 100, 100);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the shared bounds exactly on the threshold', () => {

        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 100, 100, 100);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the false if past the threshold', () => {

        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 106, 100, 100);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds === false, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === null, 'should not have had shared right bounds');
        assert(bottom === null, 'should not have had shared bottom bounds');
        assert(left === null, 'should not have had shared left bounds');
    });


    it('should return true for all if directly on top', () => {

        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 100, 100);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === 'top', 'should have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'bottom', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return true for all if directly on top, matching left bounds', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 10, 90, 80);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === null, 'should have had shared right bounds');
        assert(bottom === null, 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return true for all if directly on top, matching top, left bounds', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 90, 90);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === 'top', 'should not have had shared top bounds');
        assert(right === null, 'should have had shared right bounds');
        assert(bottom === null, 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return true for all if directly on top, matching top only', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(10, 0, 80, 90);
        const sharedBounds = rect1.sharedBoundsOnIntersection(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;

        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === 'top', 'should not have had shared top bounds');
        assert(right === null, 'should have had shared right bounds');
        assert(bottom === null, 'should have had shared bottom bounds');
        assert(left === null, 'should have had shared left bounds');
    });

    it('shared bound list should return true for all if directly on top, matching top only', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(10, 0, 80, 90);
        const sharedBoundsList = rect1.sharedBoundsList(rect2);
        assert.deepStrictEqual(sharedBoundsList, [['top', 'top']], 'should only match top top');
    });

    it('shared bound list should return true for all if directly on top, matching top, left', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 90, 90);
        const sharedBoundsList = rect1.sharedBoundsList(rect2);
        assert.deepStrictEqual(sharedBoundsList, [['top', 'top'], ['left', 'left']], 'should only match top top');
    });

    it('should not move if no shared edges', () => {
        const rect = new Rectangle(0, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 200, y: 0, width: 100, height: 100}, {x: 300, y: 0, width: 100, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 0, y: 0, width: 100, height: 100});
    });

    it('should not move if the resizing edge is not a shared one, (leader right, leader grows not shared)', () => {
        const rect = new Rectangle(0, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 100, y: 0, width: 100, height: 100}, {x: 100, y: 0, width: 110, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 0, y: 0, width: 100, height: 100});
    });


    it('should move with just the leader window move (leader top, leader grows)', () => {
        const rect = new Rectangle(100, 100, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 0, width: 100, height: 110});
        assert.deepStrictEqual(move.bounds, {x: 100, y: 110, width: 100, height: 90});
    });

    it('should move with just the leader window move (leader top, leader shrinks)', () => {
        const rect = new Rectangle(100, 100, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 0, width: 100, height: 90});
        assert.deepStrictEqual(move.bounds, {x: 100, y: 90, width: 100, height: 110});
    });

    it('should move with just the leader window move (leader bottom, leader grows)', () => {
        const rect = new Rectangle(100, 100, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 200, width: 100, height: 100}, {x: 0, y: 190, width: 100, height: 110});
        assert.deepStrictEqual(move.bounds, {x: 100, y: 100, width: 100, height: 90});
    });

    it('should move with just the leader window move (leader bottom, leader shrinks)', () => {
        const rect = new Rectangle(100, 100, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 200, width: 100, height: 100}, {x: 0, y: 210, width: 100, height: 90});
        assert.deepStrictEqual(move.bounds, {x: 100, y: 100, width: 100, height: 110});
    });

    it('should move with just the leader window move (leader left, leader grows)', () => {
        const rect = new Rectangle(100, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 0, width: 110, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 110, y: 0, width: 90, height: 100});
    });

    it('should move with just the leader window move (leader left, leader shrinks)', () => {
        const rect = new Rectangle(100, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 0, y: 0, width: 100, height: 100}, {x: 0, y: 0, width: 90, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 90, y: 0, width: 110, height: 100});
    });

    it('should move with just the leader window move (leader right, leader grows)', () => {
        const rect = new Rectangle(0, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 100, y: 0, width: 100, height: 100}, {x: 90, y: 0, width: 110, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 0, y: 0, width: 90, height: 100});
    });

    it('should move with just the leader window move (leader right, leader shrinks)', () => {
        const rect = new Rectangle(0, 0, 100, 100);
        const move = rect.propagateMoveToThisRect({x: 100, y: 0, width: 100, height: 100}, {x: 110, y: 0, width: 90, height: 100});
        assert.deepStrictEqual(move.bounds, {x: 0, y: 0, width: 110, height: 100});
    });


    it('should align the side given, left to right', () => {
        const rect = new Rectangle(100, 0, 100, 100);
        const otherRect = {x: 0, y: 0, width: 90, height: 100};
        const aligned = rect.alignSide('left', Rectangle.CREATE_FROM_BOUNDS(otherRect), 'right');
        assert(aligned.x === 90, 'side should line up');
        assert(aligned.width === 110, 'width should have been adjusted');
    });

    it('should align the side given, top to bottom', () => {
        const rect = new Rectangle(0, 110, 100, 100);
        const otherRect = {x: 0, y: 0, width: 100, height: 100};
        const aligned = rect.alignSide('top', Rectangle.CREATE_FROM_BOUNDS(otherRect), 'bottom');
        assert.deepStrictEqual(aligned.bounds, {x: 0, y: 100, width: 100, height: 110});
    });

    it ('should grow correctly on external monitors with negative y', () => {
        const rect = Rectangle.CREATE_FROM_BOUNDS({'x': 1206, 'y': -540, 'width': 491, 'height': 253});
        const grownUp = rect.grow(5, 5);

        assert.deepStrictEqual(grownUp.bounds, Rectangle.CREATE_FROM_BOUNDS({'x': 1201, 'y': -545, 'width': 501, 'height': 263}).bounds);
    });

    it ('should grow correctly on external monitors with negative x', () => {
        const rect = Rectangle.CREATE_FROM_BOUNDS({'x': -1206, 'y': 540, 'width': 491, 'height': 253});
        const grownUp = rect.grow(5, 5);

        assert.deepStrictEqual(grownUp.bounds, Rectangle.CREATE_FROM_BOUNDS({'x': -1211, 'y': 535, 'width': 501, 'height': 263}).bounds);
    });

    it ('should grow correctly on external monitors with negative x, y', () => {
        const rect = Rectangle.CREATE_FROM_BOUNDS({'x': -1206, 'y': -540, 'width': 491, 'height': 253});
        const grownUp = rect.grow(5, 5);

        assert.deepStrictEqual(grownUp.bounds, Rectangle.CREATE_FROM_BOUNDS({'x': -1211, 'y': -545, 'width': 501, 'height': 263}).bounds);
    });

    it('should collide', () => {
        const rect = Rectangle.CREATE_FROM_BOUNDS({'x': 918, 'y': -1009, 'width': 670, 'height': 454});
        const rect2 = Rectangle.CREATE_FROM_BOUNDS({'x': 952, 'y': -556, 'width': 641, 'height': 549});
        const collides = rect.collidesWith(rect2);

        assert(collides, 'should have collided, top to bottom and right to right');
    });
    it('doesnt move to negative height', () => {
        const rect1From = Rectangle.CREATE_FROM_BOUNDS({ 'x': 5104, 'y': -560, 'width': 340, 'height': 349 });
        const rect1To = Rectangle.CREATE_FROM_BOUNDS({'x': 5104, 'y': -908, 'width': 306, 'height': 697});
        const rect = Rectangle.CREATE_FROM_BOUNDS({ 'x': 5104, 'y': -686, 'width': 340, 'height': 126 });
        const result = rect.propagateMoveToThisRect(rect1From, rect1To);
        assert(result.height === 38);
    });
    it('doesnt move to negative height2', () => {
        const rect1From = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': -100, 'width': 100, 'height': 100 });
        const rect1To = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': -200, 'width': 100, 'height': 200 });
        const rect = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': -150, 'width': 100, 'height': 50 });
        const result = rect.propagateMoveToThisRect(rect1From, rect1To);
        assert(result.height === 38);
    });
    it('should recognize if another window shares the same bounds', () => {
        const rect1 = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': 0, 'width': 100, 'height': 100 });
        const rect2 = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': 0, 'width': 100, 'height': 100 });

        assert(rect1.hasIdenticalBounds(rect2), 'these windows share bounds');
    });

    it('should recognize if another window does not shares the same bounds', () => {
        const rect1 = Rectangle.CREATE_FROM_BOUNDS({ 'x': 0, 'y': 0, 'width': 100, 'height': 100 });
        const rect2 = Rectangle.CREATE_FROM_BOUNDS({ 'x': 1, 'y': 0, 'width': 100, 'height': 100 });

        assert(!(rect1.hasIdenticalBounds(rect2)), 'these windows do not share bounds');
    });

    it('should produce a graph of the window list', () => {
        const [vertices, edges] = Rectangle.GRAPH(rectList());
        const correctVertices = [0, 1, 2, 3, 4, 5];
        const correctEdges = [
            [0, 1], [0, 3],
            [1, 0], [1, 2], [1, 3], [1, 5],
            [2, 1], [2, 5],
            [3, 0], [3, 1],
            [5, 1], [5, 2]];

        assert.deepStrictEqual(vertices, correctVertices, 'vertices should match');
        assert.deepStrictEqual(edges, correctEdges, 'edges should match');
    });

    it('should produce a distance set given a graph and a reference vertex', () => {
        const distances = Rectangle.DISTANCES(Rectangle.GRAPH(rectList()), 0);
        const correctDistances = [[0, 0], [1, 1], [2, 2], [3, 1], [4, Infinity], [5, 2]];

        assert.deepEqual([...distances], correctDistances, 'reported distances are incorrect');
    });

    it('should propagate a move through the window graph, center height constraint', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 90});
        const rectsInit = [
            startRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 200, width: 100, height: 100})];
        const rectsFinal = [
            endRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 90, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 190, width: 100, height: 110})];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should propagate a move through the window graph, double center height constraint', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 90});
        const rectsInit = [
            startRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 200, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 300, width: 100, height: 100})];
        const rectsFinal = [
            endRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 90, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 190, width: 100, height: 100}, {maxHeight: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 290, width: 100, height: 110})];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should propagate a move through the window graph, no constraint', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 90});
        const rectsInit = [
            startRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 200, width: 100, height: 100})];
        const rectsFinal = [
            endRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 90, width: 100, height: 110}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 200, width: 100, height: 100})];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should propagate a move through the window graph, width constraint, horizontal', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 130, height: 100});
        const rectsInit = [
            startRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 0, width: 100, height: 100}, {minWidth: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 200, y: 0, width: 100, height: 100})];
        const rectsFinal = [
            endRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 130, y: 0, width: 100, height: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 230, y: 0, width: 70, height: 100})];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should propagate a move through the window graph, width constraint, horizontal, huge jump', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 330, height: 100});
        const rectsInit = [
            startRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 0, width: 100, height: 100}, {minWidth: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 200, y: 0, width: 100, height: 100}, {minWidth: 100})];
        const rectsFinal = [
            endRect,
            Rectangle.CREATE_FROM_BOUNDS({x: 330, y: 0, width: 100, height: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 430, y: 0, width: 100, height: 100})];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should propagate a move through the window graph correctly when there are 3 windows and 2 have the same bounds', () => {
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 100});
        const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 101});
        const rectsInit = [
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 100}),
            startRect
        ];

        const rectsFinal = [
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 0, width: 100, height: 100}),
            Rectangle.CREATE_FROM_BOUNDS({x: 0, y: 100, width: 100, height: 101}),
            endRect
        ];

        const delta = startRect.delta(endRect);

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(2, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
    });

    it('should do THIS move correctly', () => {

        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 908, y: 509, height: 222, width: 491});
        const rectsInit = [
            Rectangle.CREATE_FROM_BOUNDS({x: 908, y: 509, height: 222, width: 491}),
            Rectangle.CREATE_FROM_BOUNDS({x: 906, y: 731, height: 223, width: 491})];

        // numbers that fail here: 11, 14, 22, 26, 33, 52, 97
        const chg = 26;
        const delta = {x: 0, y: -chg, height: chg, width: 0};

        const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
        assert.deepEqual(propagatedMoves[0].bounds.height, startRect.height + delta.height);
    });

    it('should do larger moves correctly', () => {
        let heightChange = 0;
        const startRect = Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 100, width: 100, height: 100});

        while (heightChange < 50) {
            const endRect = Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 100 - heightChange, width: 100, height: 100 + heightChange});
            const rectsInit = [
                startRect,
                Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 200, width: 100, height: 100})];
            const rectsFinal = [
                endRect,
                Rectangle.CREATE_FROM_BOUNDS({x: 100, y: 200, width: 100, height: 100})];
            const delta = startRect.delta(endRect);
            const propagatedMoves = Rectangle.PROPAGATE_MOVE(0, startRect, delta, rectsInit);
            assert.deepEqual(propagatedMoves.map(x => x.bounds), rectsFinal.map(x => x.bounds));
            heightChange++;
        }
    });
});

function rectList (): Rectangle[] {
    return [
        new Rectangle(0, 0, 100, 100),
        new Rectangle(4, 4, 100, 100),
        new Rectangle(8, 8, 100, 100),
        new Rectangle(50, 0, 100, 100),
        new Rectangle(400, 400, 100, 100),
        new Rectangle(6, 6, 100, 100)
    ];
}