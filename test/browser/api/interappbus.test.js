/*
Copyright 2017 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const should = require('should'),
    { describe, it } = require('mocha'),
    rewire = require('rewire'),
    sinon = require('sinon'),
    interappbus = rewire('../../../staging/core/src/browser/api/interappbus'),
    { InterApplicationBus } = interappbus
    require('should-sinon')

describe('InterApplicationBus as a white-box', function() {
    describe('var busEventing', function() {
        let busEventing
        const payload = { senderUuid: 'AAA', senderName: 'Mocha' }
        before(function() {
            busEventing = interappbus.__get__('busEventing')
        })

        it('subclasses EventEmitter', function() {
            busEventing.should.be.instanceof(interappbus.__get__('EventEmitter'))
        })
        it('enriches "subscriber-added"', function() {
            const spy = sinon.spy()
            busEventing.prependListener('subscriber-added/AAA/Mocha', spy)
            
            busEventing.emit('subscriber-added', payload)

            spy.should.be.calledWith(payload)
        })
        it('enriches "subscriber-removed"', function() {
            const spy = sinon.spy()
            busEventing.prependListener('subscriber-removed/AAA/Mocha', spy)

            busEventing.emit('subscriber-removed', payload)

            spy.should.be.calledWith(payload)
        })
    })

    describe('var ofBus', function() {
        it('subclasses EventEmitter', function() {
            interappbus.__get__('ofBus')
                .should.be.instanceof(interappbus.__get__('EventEmitter'))
        })
    })

    describe('genCallBackId()', function() {
        it('returns unique ids', function() {
            const sut = interappbus.__get__('genCallBackId'),
                a = sut(),
                b = sut()

            a.should.not.equal(b)
        })
    })
})

describe('InterApplicationBus as a black-box', function() {
    const senderId = Object.freeze({ uuid: 'AAA', name: 'Mocha' }),
        receiverId = Object.freeze({ uuid: 'AAB', name: 'Sinon' }),
        msg = 'BBB'
    describe('publish()/subscribe()', function() {
        it('to a specific sender & topic', function() {
            const spy = sinon.spy(),
                topicWithSpace = 'a topic'
            InterApplicationBus.subscribe(receiverId, senderId.uuid, senderId.name, topicWithSpace, spy)

            InterApplicationBus.publish(senderId, topicWithSpace, msg)

            spy.should.be.calledWith({ identity: senderId, message: msg })
                .and.be.calledOnce()
        })
        it('to a specific topic from any sender', function() {
            const spy = sinon.spy(),
                topicWithSlash = 'a/topic'
            InterApplicationBus.subscribe(receiverId, '*', topicWithSlash, spy)

            InterApplicationBus.publish(senderId, topicWithSlash, msg)

            spy.should.be.calledWith({ identity: senderId, message: msg })
                .and.be.calledOnce()
        })
        it('to a specific topic from any sender, short-hand', function() {
            const spy = sinon.spy(),
                topicWithStar = '*/topic'
            InterApplicationBus.subscribe(receiverId, '', topicWithStar, spy)

            InterApplicationBus.publish(senderId, topicWithStar, msg)

            spy.should.be.calledWith({ identity: senderId, message: msg })
                .and.be.calledOnce()
        })
        it.skip('to a wild-card topic from a specific sender', function() {
            const spy = sinon.spy(),
                topic = 'topic' 
            InterApplicationBus.subscribe(receiverId, senderId.uuid, senderId.name, '*', spy)

            InterApplicationBus.publish(senderId, topic, msg)
            
            spy.should.be.calledWith({ identity: senderId, message: msg })
                .and.be.calledOnce()
        })
    })

    describe('send()/subscribe()')
})
