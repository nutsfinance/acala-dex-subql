// Auto-generated , DO NOT EDIT
import {Entity, FunctionPropertyNames} from "@subql/types";
import assert from 'assert';




type HourPoolProps = Omit<HourPool, NonNullable<FunctionPropertyNames<HourPool>>>;

export class HourPool implements Entity {

    constructor(id: string) {
        this.id = id;
    }


    public id: string;

    public poolId?: string;

    public timestamp?: Date;

    public token0Id?: string;

    public token1Id?: string;

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
        assert(id !== null, "Cannot save HourPool entity without an ID");
        await store.set('HourPool', id.toString(), this);
    }
    static async remove(id:string): Promise<void>{
        assert(id !== null, "Cannot remove HourPool entity without an ID");
        await store.remove('HourPool', id.toString());
    }

    static async get(id:string): Promise<HourPool | undefined>{
        assert((id !== null && id !== undefined), "Cannot get HourPool entity without an ID");
        const record = await store.get('HourPool', id.toString());
        if (record){
            return HourPool.create(record as HourPoolProps);
        }else{
            return;
        }
    }


    static async getByPoolId(poolId: string): Promise<HourPool[] | undefined>{
      
      const records = await store.getByField('HourPool', 'poolId', poolId);
      return records.map(record => HourPool.create(record as HourPoolProps));
      
    }

    static async getByToken0Id(token0Id: string): Promise<HourPool[] | undefined>{
      
      const records = await store.getByField('HourPool', 'token0Id', token0Id);
      return records.map(record => HourPool.create(record as HourPoolProps));
      
    }

    static async getByToken1Id(token1Id: string): Promise<HourPool[] | undefined>{
      
      const records = await store.getByField('HourPool', 'token1Id', token1Id);
      return records.map(record => HourPool.create(record as HourPoolProps));
      
    }


    static create(record: HourPoolProps): HourPool {
        assert(typeof record.id === 'string', "id must be provided");
        let entity = new HourPool(record.id);
        Object.assign(entity,record);
        return entity;
    }
}
