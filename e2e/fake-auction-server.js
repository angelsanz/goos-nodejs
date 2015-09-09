import Redis from 'then-redis';
import Promise from 'bluebird';
import retry from 'qretry';
import {SniperStatus} from '../src/main';
import {expect} from 'chai';
var debug = require('debug')('goos:FakeAuctionServer');

export default function FakeAuctionServer(_itemId) {
    this.itemId = _itemId;

    const subscriber = Redis.createClient();
    const publisher = Redis.createClient();

    let topic;
    let messageQueue;

    this.startSellingItem = function() {
        topic = `auction-${this.itemId}`;

        messageQueue = new BlockingQueue(subscriber, topic);
        subscriber.on('message', (channel, jsonMessage) => {
            debug("received a message on channel", channel, jsonMessage);
            if (channel === topic) messageQueue.push(JSON.parse(jsonMessage));
        });

        debug("subscribing to topic", topic);
        return subscriber.subscribe(topic);
    }

    this.announceClosed = function() {
        return publisher.publish(topic, JSON.stringify({command: "Close"}));
    }

    this.hasReceivedJoinRequestFromSniper = function() {
        messageQueue.waitForMessage().then(message => {
            expect(message.command).to.equal("Join");
        });
    }

    this.hasReceivedBid = function(bid) {
        return messageQueue.waitForMessage().then(message => {
            expect(message.command).to.equal("Bid");
            expect(message.bid).to.equal(bid);
        })
    }

    this.stop = function() {
        return Promise.all([subscriber.quit(), publisher.quit()]);
    }

}

function BlockingQueue(topic) {
    var messages = [];

    this.push = function(message) {
        messages.push(message);
    }

    this.waitForMessage = function() {
        return retry(() => new Promise((resolve, reject) => {
            if (!messages.length) {
                reject(new Error("No messages received"));
            } else {
                var message = messages.pop();
                debug("Popped a message: ", message);
                return resolve(message);
            }
        }));
    }
}