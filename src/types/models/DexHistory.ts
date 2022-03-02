// Auto-generated , DO NOT EDIT
import {Entity, FunctionPropertyNames} from "@subql/types";
import assert from 'assert';

import {
    KVData,
} from '../interfaces'




type DexHistoryProps = Omit<DexHistory, NonNullable<FunctionPropertyNames<DexHistory>>>;

export class DexHistory implements Entity {

    constructor(id: string) {
        this.id = id;
    }


    public id: string;

    public accountId?: string;

    public type?: string;

    public subType?: string;

    public data?: KVData[];

    public poolId?: string;

    public token0Id?: string;

    public token1Id?: string;

    public token0Amount?: string;

    public token1Amount?: string;

    public volumeUSD?: string;

    public extrinsicId?: string;

    public timestamp?: Date;


    async save(): Promise<void>{
        let id = this.id;
        assert(id !== null, "Cannot save DexHistory entity without an ID");
        await store.set('DexHistory', id.toString(), this);
    }
    static async remove(id:string): Promise<void>{
        assert(id !== null, "Cannot remove DexHistory entity without an ID");
        await store.remove('DexHistory', id.toString());
    }

    static async get(id:string): Promise<DexHistory | undefined>{
        assert((id !== null && id !== undefined), "Cannot get DexHistory entity without an ID");
        const record = await store.get('DexHistory', id.toString());
        if (record){
            return DexHistory.create(record as DexHistoryProps);
        }else{
            return;
        }
    }


    static async getByAccountId(accountId: string): Promise<DexHistory[] | undefined>{
      
      const records = await store.getByField('DexHistory', 'accountId', accountId);
      return records.map(record => DexHistory.create(record as DexHistoryProps));
      
    }

    static async getByPoolId(poolId: string): Promise<DexHistory[] | undefined>{
      
      const records = await store.getByField('DexHistory', 'poolId', poolId);
      return records.map(record => DexHistory.create(record as DexHistoryProps));
      
    }

    static async getByToken0Id(token0Id: string): Promise<DexHistory[] | undefined>{
      
      const records = await store.getByField('DexHistory', 'token0Id', token0Id);
      return records.map(record => DexHistory.create(record as DexHistoryProps));
      
    }

    static async getByToken1Id(token1Id: string): Promise<DexHistory[] | undefined>{
      
      const records = await store.getByField('DexHistory', 'token1Id', token1Id);
      return records.map(record => DexHistory.create(record as DexHistoryProps));
      
    }

    static async getByExtrinsicId(extrinsicId: string): Promise<DexHistory[] | undefined>{
      
      const records = await store.getByField('DexHistory', 'extrinsicId', extrinsicId);
      return records.map(record => DexHistory.create(record as DexHistoryProps));
      
    }


    static create(record: DexHistoryProps): DexHistory {
        assert(typeof record.id === 'string', "id must be provided");
        let entity = new DexHistory(record.id);
        Object.assign(entity,record);
        return entity;
    }
}
