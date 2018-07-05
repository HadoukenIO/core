import {EventEmitter} from 'events';

interface ITransaction {
    name: string;
    uuid: string;
    type: string;
}

class WindowGroupTransactionTracker extends EventEmitter {
    public transactions: {
        [groupUuid: string]: ITransaction;
    };

    constructor() {
        super();
        this.transactions = {};
    }

    public getGroupLeader(groupUuid: string): ITransaction {
        return this.transactions[groupUuid];
    }

    public setGroupLeader(groupUuid: string, name: string, uuid: string, type: string): void {
        this.transactions[groupUuid] = {name, uuid, type};
    }

    public clearGroup(groupUuid: string): void {
        delete this.transactions[groupUuid];
    }

    public notifyEndTransaction(groupUuid: string): void {
        this.emit('end-window-group-transaction', groupUuid);
    }
}

export default new WindowGroupTransactionTracker();