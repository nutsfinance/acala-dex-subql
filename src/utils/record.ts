import { getTokenDecimals } from ".";
import {
  Account, Collateral, Block, Extrinsic
} from "../types";
import { DailyDex } from "../types/models/DailyDex";
import { DailyPool } from "../types/models/DailyPool";
import { Dex } from "../types/models/Dex";
import { DexHistory } from "../types/models/DexHistory";
import { HourDex } from "../types/models/HourDex";
import { HourPool } from "../types/models/HourPool";
import { Pool } from "../types/models/Pool";
import { ProvisionPool } from "../types/models/ProvisionPool";
import { UserProvision } from "../types/models/UserProvision";

export const getAccount = async (address: string) => {
  const _account = await Account.get(address);
  if (!_account) {
    const newAccount = new Account(address);
    newAccount.address = address;
    newAccount.txCount = BigInt(0);
    await newAccount.save();
    return newAccount;
  } else {
    return _account;
  }
}

export const getBlock = async (id: string) => {
  const _block = await Block.get(id);
  if (!_block) {
    const newBlock = new Block(id);
    newBlock.hash = '';
    newBlock.number = BigInt(0);
    newBlock.timestamp = new Date();
    await newBlock.save();
    return newBlock;
  } else {
    return _block;
  }
}

export const getCollateral = async (token: string) => {
  const _collateral = await Collateral.get(token);
  const decimals = await getTokenDecimals(api as any, token);
  if (!_collateral) {
    const newCollateral = new Collateral(token);
    newCollateral.name = token;
    newCollateral.decimals = decimals;
    await newCollateral.save();
    return newCollateral;
  } else {
    return _collateral;
  }
}

export const getDailyDex = async (id: string) => {
  const record = await DailyDex.get(id);

  if(!record) {
    const newRecord = new DailyDex(id);
    newRecord.poolCount = 0;
    newRecord.timestamp = new Date();
    newRecord.dailyVolumeUSD = '';
    newRecord.totalTVLUSD = '';
    newRecord.totalVolumeUSD = '';
  } else {
    return record;
  }
}


export const getDailyPool = async (id: string) => {
  const record = await DailyPool.get(id);

  if(!record) {
    const newRecord = new DailyPool(id);
    newRecord.poolId = '';
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.timestamp = new Date();
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
    newRecord.exchange0 = '';
    newRecord.exchange1 = '';
    newRecord.volumeToken0 = '';
    newRecord.volumeToken1 = '';
    newRecord.volumeUSD = '';
    newRecord.txCount = BigInt(0);
    newRecord.tvlUSD = '';
    newRecord.token0Open = '';
    newRecord.token0High = '';
    newRecord.token0Low = '';
    newRecord.token0Close = '';
  } else {
    return record;
  }
}

export const getDex = async (id: string) => {
  const record = await Dex.get(id);

  if(!record) {
    const newRecord = new Dex(id);
    newRecord.poolCount = 0;
    newRecord.totalTVLUSD = '';
    newRecord.totalVolumeUSD = '';
  } else {
    return record;
  }
}

export const getDexHistory = async (id: string) => {
  const record = await DexHistory.get(id);

  if(!record) {
    const newRecord = new DexHistory(id);
    newRecord.accountId = '';
    newRecord.type = '';
    newRecord.subType = '';
    newRecord.data = [];
    newRecord.poolId = '';
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
    newRecord.volumeUSD = '';
    newRecord.extrinsicId = '';
    newRecord.timestamp = new Date();
  } else {
    return record;
  }
}

export const getExtrinsic = async (id: string) => {
  const record = await Extrinsic.get(id);

  if(!record) {
    const newRecord = new Extrinsic(id);
    newRecord.hash = '';
    newRecord.blockId = '';
  } else {
    return record;
  }
}

export const getHourDex = async (id: string) => {
  const record = await HourDex.get(id);

  if(!record) {
    const newRecord = new HourDex(id);
    newRecord.poolCount = 0;
    newRecord.timestamp = new Date();
    newRecord.dailyVolumeUSD = '';
    newRecord.totalVolumeUSD = '';
    newRecord.totalTVLUSD = '';
  } else {
    return record;
  }
}

export const getHourPool = async (id: string) => {
  const record = await HourPool.get(id);

  if(!record) {
    const newRecord = new HourPool(id);
    newRecord.poolId = '';
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.timestamp = new Date();
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
    newRecord.exchange0 = '';
    newRecord.exchange1 = '';
    newRecord.volumeToken0 = '';
    newRecord.volumeToken1 = '';
    newRecord.volumeUSD = '';
    newRecord.txCount = BigInt(0);
    newRecord.tvlUSD = '';
    newRecord.token0Open = '';
    newRecord.token0High = '';
    newRecord.token0Low = '';
    newRecord.token0Close = '';
  } else {
    return record;
  }
}

export const getPool = async (id: string) => {
  const record = await Pool.get(id);

  if(!record) {
    const newRecord = new Pool(id);
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
    newRecord.exchange0 = '';
    newRecord.exchange1 = '';
    newRecord.fee = '';
    newRecord.token0Volume = '';
    newRecord.token1Volume = '';
    newRecord.volumeUSD = '';
    newRecord.txCount = BigInt(0);
    newRecord.tvlUSD = '';
    newRecord.token1TVL = '';
    newRecord.token0TVL = '';
  } else {
    return record;
  }
}

export const getProvisionPool = async (id: string) => {
  const record = await ProvisionPool.get(id);

  if(!record) {
    const newRecord = new ProvisionPool(id);
    newRecord.poolTokenId = '';
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
    newRecord.initializeShare = '';
    newRecord.startAtBlockNumber = BigInt(0);
    newRecord.startAtBlockId = '';
    newRecord.endAtBlockNumber = BigInt(0);
    newRecord.endAtBlockId = '';
    newRecord.txCount = BigInt(0);
  } else {
    return record;
  }
}

export const getUserProvision = async (id: string) => {
  const record = await UserProvision.get(id);

  if(!record) {
    const newRecord = new UserProvision(id);
    newRecord.ownerId = '';
    newRecord.poolId = '';
    newRecord.token0Id = '';
    newRecord.token1Id = '';
    newRecord.token0Amount = '';
    newRecord.token1Amount = '';
  } else {
    return record;
  }
}