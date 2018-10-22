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
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 97, 100, 100);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the shared bounds within threshold, below', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 104, 100, 100);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the shared bounds exactly on the threshold', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 100, 100, 100);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'top', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return the false if past the threshold', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 106, 100, 100);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds === false, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === null, 'should not have had shared right bounds');
        assert(bottom === null, 'should not have had shared bottom bounds');
        assert(left === null, 'should not have had shared left bounds');
    });


    it('should return true for all if directly on top', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 100, 100);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === 'top', 'should have had shared top bounds');
        assert(right === 'right', 'should have had shared right bounds');
        assert(bottom === 'bottom', 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return true for all if directly on top, matching left bounds', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 10, 90, 80);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === null, 'should not have had shared top bounds');
        assert(right === null, 'should have had shared right bounds');
        assert(bottom === null, 'should have had shared bottom bounds');
        assert(left === 'left', 'should have had shared left bounds');
    });

    it('should return true for all if directly on top, matching top, left bounds', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 90, 90);
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
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
        const sharedBounds = rect1.sharedBounds(rect2);
        const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
        // tslint:disable 
        // console.log(rect1.sharedBounds(rect2));
        assert(hasSharedBounds, 'should have had shared bounds');
        assert(top === 'top', 'should not have had shared top bounds');
        assert(right === null, 'should have had shared right bounds');
        assert(bottom === null, 'should have had shared bottom bounds');
        assert(left === null, 'should have had shared left bounds');
    });

    it('shared bound list should return true for all if directly on top, matching top only', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(10, 0, 80, 90);
        const sharedBoundsList = rect1.sharedBoundsList(rect2);
        // tslint:disable 
        assert.deepStrictEqual(sharedBoundsList, [['top', 'top']], 'should only match top top')
    });

    it('shared bound list should return true for all if directly on top, matching top, left', () => {
        // bottom
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(0, 0, 90, 90);
        const sharedBoundsList = rect1.sharedBoundsList(rect2);
        // tslint:disable 
        assert.deepStrictEqual(sharedBoundsList, [['top', 'top'], ['left', 'left']], 'should only match top top')
    });

    // enable me!!
    it ('should return the bounds should the rect move left to right', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(100, 0, 100, 100);
        const sharedBoundsList = rect2.sharedBoundsList(rect1);
        const delta = {x: 0, y: 0, width: 10, height: 0};

        const moved = rect2.move(sharedBoundsList, delta);

        assert.deepStrictEqual(moved, {x: 110, y: 0, width: 90, height: 100});
    });

    it('should not move if the resizing edge is not a shared one', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(100, 0, 100, 100);
        const sharedBoundsList = rect2.sharedBoundsList(rect1);
        const delta = {x: 10, y: 0, width: -10, height: 0};

        const moved = rect2.move(sharedBoundsList, delta);

        assert.deepStrictEqual(moved, {x: 100, y: 0, width: 100, height: 100});
    });

    it('should not move if the resizing edge is not a shared one', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(100, 0, 100, 80);
        const sharedBoundsList = rect2.sharedBoundsList(rect1);
        const delta = {x: 0, y: 0, width: 0, height: -11};

        const moved = rect2.move(sharedBoundsList, delta);

        assert.deepStrictEqual(moved, {x: 100, y: 0, width: 100, height: 80});
    });

    it('should not move if the resizing edge is not a shared one, resize left, joined right', () => {
        const rect1 = new Rectangle(10, 0, 100, 100);
        const rect2 = new Rectangle(110, 0, 100, 100);
        const sharedBoundsList = rect2.sharedBoundsList(rect1);
        const delta = {x: -4, y: 0, width: 4, height: 0};

        const moved = rect2.move(sharedBoundsList, delta);

        assert.deepStrictEqual(moved, {x: 110, y: 0, width: 100, height: 100});
    });

    it ('should move the window when there is a shared edge', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = new Rectangle(100, 0, 100, 100);
        const sharedBoundsList = rect2.sharedBoundsList(rect1);
        const delta = {x: 0, y: 0, width: -10, height: 0};
        const moved = rect2.move(sharedBoundsList, delta);

        assert.deepStrictEqual(moved, {x: 90, y: 0, width: 110, height: 100});
    });

    it ('should return the bounds should the rect move right to left', () => {
        const rect1 = new Rectangle(0, 0, 100, 100);
        const rect2 = Rectangle.CREATE_FROM_BOUNDS({
            "x": 554,
            "y": 69,
            "width": 834,
            "height": 300
        });
        const sharedBoundsList = <SharedBoundsList>[['top', 'top'], ['left', 'right']];
        // const delta = {x: 10, y: 0, width: -10, height: 0};

        const moved = rect2.move(sharedBoundsList, {
            "x": 0,
            "y": 0,
            "width": -10,
            "height": 0
        });

        assert.deepStrictEqual(moved, {"x": 544, "y": 69, "width": 844, "height": 300});
    });
    // RIGHT 
    // OVERLAPPING exactly 
    // LEFT 
    // TOP 
    // INSIDE 
    // OVERLAPPING NO SHARED 

    // it('should return the shared right bounds within threshold', () => {
    //     // bottom
    //     const rect1 = new Rectangle(0, 0, 100, 100);
    //     const rect2 = new Rectangle(0, 97, 100, 100);
    //     const sharedBounds = rect1.sharedBounds(rect2);
    //     const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
    //     // tslint:disable 
    //     // console.log(rect1.sharedBounds(rect2));
    //     assert(hasSharedBounds, 'should have had shared bounds');
    //     assert(top === null, 'should not have had shared top bounds');
    //     assert(right === 'right', 'should have had shared bottom bounds');
    //     assert(bottom === 'top', 'should have had shared bottom bounds');
    //     assert(left === 'left', 'should have had shared bottom bounds');
    // });

    // it('should return the shared bounds bottom right at the threshold', () => {
    //     // bottom
    //     const rect1 = new Rectangle(0, 0, 100, 100);
    //     const rect2 = new Rectangle(0, 100, 100, 100);
    //     const sharedBounds = rect1.sharedBounds(rect2);
    //     const {hasSharedBounds, top, right, bottom, left} = sharedBounds;
    //     // tslint:disable 
    //     // console.log(rect1.sharedBounds(rect2));
    //     assert(hasSharedBounds, 'should have had shared bounds');
    // });
});