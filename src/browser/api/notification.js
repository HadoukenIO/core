export function Notification() {
    this.getCurrentNotification = function() {};
    this.getCurrent = function() {};
}

Notification.prototype.close = function(callback) {
    if (callback) {
        callback();
    }
};

Notification.prototype.sendMessage = function( /*message, callback*/ ) {};
Notification.prototype.sendMessageToApplication = function( /*message, callback*/ ) {};
