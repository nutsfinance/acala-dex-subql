// Auto-generated , DO NOT EDIT
import {Entity, FunctionPropertyNames} from "@subql/types";
import assert from 'assert';




type DailyPoolProps = Omit<DailyPool, NonNullable<FunctionPropertyNames<DailyPool>>>;

export class DailyPool implements Entity {

    constructor(id: string) {
        this.id = id;
    }


    public id: string;

    public poolId?: string;

    public token0Id: string;

    public token1Id: string;

    public timestamp?: Date;

    public token0Amount?: string;

    public token1Amount?: string;

    public exchange0?: string;

    public exchange1?: string;

    public volumeToken0?: string;

    public volumeToken1?: string;

    public volumeUSD?: string;

    public txCount?: bigint;

    public tvlUSD?: string;

    public token0Open?: string;

    public token0High?: string;

    public token0Low?: string;

    public token0Close?: string;


    async save(): Promise<void>{
        let id = this.id;
        assert(id !== null, "Cannot save DailyPool entity without an ID");
        await store.set('DailyPool', id.toString(), this);
    }
    static async remove(id:string): Promise<void>{
        assert(id !== null, "Cannot remove DailyPool entity without an ID");
        await store.remove('DailyPool', id.toString());
    }

    static async get(id:string): Promise<DailyPool | undefined>{
        assert((id !== null && id !== undefined), "Cannot get DailyPool entity without an ID");
        const record = await store.get('DailyPool', id.toString());
        if (record){
            return DailyPool.create(record as DailyPoolProps);
        }else{
            return;
        }
    }


    static async getByPoolId(poolId: string): Promise<DailyPool[] | undefined>{
      
      const records = await store.getByField('DailyPool', 'poolId', poolId);
      return records.map(record => DailyPool.create(record as DailyPoolProps));
      
    }

    static async getByToken0Id(token0Id: string): Promise<DailyPool[] | undefined>{
      
      const records = await store.getByField('DailyPool', 'token0Id', token0Id);
      return records.map(record => DailyPool.create(record as DailyPoolProps));
      
    }

    static async getByToken1Id(token1Id: string): Promise<DailyPool[] | undefined>{
      
      const records = await store.getByField('DailyPool', 'token1Id', token1Id);
      return records.map(record => DailyPool.create(record as DailyPoolProps));
      
    }


    static create(record: DailyPoolProps): DailyPool {
        assert(typeof record.id === 'string', "id must be provided");
        let entity = new DailyPool(record.id);
        Object.assign(entity,record);
        return entity;
    }
}
