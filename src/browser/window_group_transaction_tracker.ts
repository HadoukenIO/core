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