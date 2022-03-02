// Auto-generated , DO NOT EDIT
import {Entity, FunctionPropertyNames} from "@subql/types";
import assert from 'assert';




type HourDexProps = Omit<HourDex, NonNullable<FunctionPropertyNames<HourDex>>>;

export class HourDex implements Entity {

    constructor(id: string) {
        this.id = id;
    }


    public id: string;

    public poolCount?: number;

    public timestamp?: Date;

    public dailyVolumeUSD?: string;

    public totalVolumeUSD?: string;

    public totalTVLUSD?: string;


    async save(): Promise<void>{
        let id = this.id;
        assert(id !== null, "Cannot save HourDex entity without an ID");
        await store.set('HourDex', id.toString(), this);
    }
    static async remove(id:string): Promise<void>{
        assert(id !== null, "Cannot remove HourDex entity without an ID");
        await store.remove('HourDex', id.toString());
    }

    static async get(id:string): Promise<HourDex | undefined>{
        assert((id !== null && id !== undefined), "Cannot get HourDex entity without an ID");
        const record = await store.get('HourDex', id.toString());
        if (record){
            return HourDex.create(record as HourDexProps);
        }else{
            return;
        }
    }



    static create(record: HourDexProps): HourDex {
        assert(typeof record.id === 'string', "id must be provided");
        let entity = new HourDex(record.id);
        Object.assign(entity,record);
        return entity;
    }
}