import { FixedPointNumber as FN } from "@acala-network/sdk-core";
import { getStartOfDay, getStartOfHour } from "@acala-network/subql-utils";
import { Balance, TradingPair } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import { ensureBlock, ensureExtrinsic } from ".";
import { getDailyDex, getDex, getHourDex, getHourlyPool, getPool, getProvisionPool, getProvisionToEnabled, getToken, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const provisionToEnable = async (event: SubstrateEvent) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount]
  const [tradingPair, _token0Amount, _token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);
  const blockData = await ensureBlock(event);

  const price0 = await queryPrice(event, token0Id);
  const price1 = await queryPrice(event, token1Id);

  const token0Amount = BigInt(_token0Amount.toString());
  const token1Amount = BigInt(_token1Amount.toString());

  const token0Value = BigInt(new FN(token0Amount.toString()).times(price0).toChainData());
  const token1Value = BigInt(new FN(token1Amount.toString()).times(price1).toChainData());

  const poolToken = await getToken(poolId);
  const token0 = await getToken(token0Id);
  const token1 = await getToken(token1Id);

  poolToken.amount = token0Value + token1Value;
  token0.amount = token0Value;
  token1.amount = token1Value;

  poolToken.amount = token0Value + token1Value;
  token0.amount = token0Value;
  token1.amount = token1Value;

  const pool = await getProvisionPool(poolId);
  pool.token0Amount = token0Amount;
  pool.token1Amount = token1Amount
  pool.initializeShare = BigInt(totalShareAmount.toString());

  pool.endAtBlockId = blockData.hash;
  pool.endAt = blockData.timestamp;

  await poolToken.save();
  await token0.save();
  await token1.save();
  await pool.save();
}

export const createPool = async (event: SubstrateEvent) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, _token0Amount, _token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);

  const token0 = await getToken(token0Id);
  const token1 = await getToken(token1Id)

  const token0Amount = FN.fromInner(_token0Amount.toString(), token0.decimals);
  const token1Amount = FN.fromInner(_token1Amount.toString(), token1.decimals);

  const price0 = await queryPrice(event, token0.name);
  const price1 = await queryPrice(event, token1.name);

  const pool = await getPool(token0Id, token1Id, poolId);
  pool.token0Id = token0Id;
  pool.token1Id = token1Id;
  pool.token0Amount = BigInt(token0Amount.toChainData());
  pool.token1Amount = BigInt(token1Amount.toChainData());
  pool.token0Price = BigInt(price0.toChainData());
  pool.token1Price = BigInt(price1.toChainData());
  pool.token0TVL = BigInt(token0Amount.times(price0).toChainData());
  pool.token1TVL = BigInt(token1Amount.times(price1).toChainData());
  pool.totalTVL = pool.token0TVL + pool.token1TVL;

  await pool.save();
  await createHourPool(event, token0Amount, token1Amount, price0, price1);
  await createDailyPool(event, token0Amount, token1Amount, price0, price1);
  await createDex(event, BigInt(token0Amount.times(price0).add(token1Amount).times(price1).toChainData()));
}

export const createHourPool = async (event: SubstrateEvent, token0Amount: FN, token1Amount: FN, price0: FN, price1: FN) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, _token0Amount, _token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);
  const hourTime = getStartOfHour(event.block.timestamp).getTime();

  const hourPoolId = `${token0Id}-${token1Id}-${hourTime}`
  const hourPool = await getHourlyPool(hourPoolId);
  hourPool.poolId = poolId;
  hourPool.timestamp = event.block.timestamp;
  hourPool.token0Id = token0Id;
  hourPool.token1Id = token1Id;
  hourPool.token0Amount = BigInt(token0Amount.toChainData());
  hourPool.token1Amount = BigInt(token1Amount.toChainData());
  hourPool.token0Price = BigInt(price0.toChainData());
  hourPool.token1Price = BigInt(price1.toChainData());
  hourPool.token0TVL = BigInt(token0Amount.times(price0).toChainData());
  hourPool.token1TVL = BigInt(token1Amount.times(price1).toChainData());
  hourPool.totalTVL = hourPool.token0TVL + hourPool.token1TVL;
  hourPool.token0High = BigInt(price0.toChainData());
  hourPool.token0High = BigInt(price0.toChainData());
  hourPool.token0Low = BigInt(price0.toChainData());
  hourPool.token0Close = BigInt(price0.toChainData());
  hourPool.token1High = BigInt(price1.toChainData());
  hourPool.token1High = BigInt(price1.toChainData());
  hourPool.token1Low = BigInt(price1.toChainData());
  hourPool.token1Close = BigInt(price1.toChainData());

  await hourPool.save();
}

export const createDailyPool = async (event: SubstrateEvent, token0Amount: FN, token1Amount: FN, price0: FN, price1: FN) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, _token0Amount, _token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);
  const hourTime = getStartOfHour(event.block.timestamp).getTime();

  const dailyPoolId = `${token0Id}-${token1Id}-${hourTime}`
  const dailyPool = await getHourlyPool(dailyPoolId);
  dailyPool.poolId = poolId;
  dailyPool.timestamp = event.block.timestamp;
  dailyPool.token0Id = token0Id;
  dailyPool.token1Id = token1Id;
  dailyPool.token0Amount = BigInt(token0Amount.toChainData());
  dailyPool.token1Amount = BigInt(token1Amount.toChainData());
  dailyPool.token0Price = BigInt(price0.toChainData());
  dailyPool.token1Price = BigInt(price1.toChainData());
  dailyPool.token0TVL = BigInt(token0Amount.times(price0).toChainData());
  dailyPool.token1TVL = BigInt(token1Amount.times(price1).toChainData());
  dailyPool.totalTVL = dailyPool.token0TVL + dailyPool.token1TVL;
  dailyPool.token0High = BigInt(price0.toChainData());
  dailyPool.token0High = BigInt(price0.toChainData());
  dailyPool.token0Low = BigInt(price0.toChainData());
  dailyPool.token0Close = BigInt(price0.toChainData());
  dailyPool.token1High = BigInt(price1.toChainData());
  dailyPool.token1High = BigInt(price1.toChainData());
  dailyPool.token1Low = BigInt(price1.toChainData());
  dailyPool.token1Close = BigInt(price1.toChainData());

  await dailyPool.save();
}

export const createDex = async (event: SubstrateEvent, totalTvl: bigint) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, _token0Amount, _token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);
  const dex = await getDex('dex');
  const timestamp = event.block.timestamp;

  dex.poolCount = dex.poolCount + 1;
  dex.totalTVL = dex.totalTVL + totalTvl;

  await dex.save();
  await createHourDex(dex.poolCount, dex.totalTVL, timestamp);
  await createDailyDex(dex.poolCount, dex.totalTVL, timestamp);
}

export const createHourDex = async (count: number, totalTvl: bigint, timestamp: Date) => {
  const hourTime = getStartOfHour(timestamp);
  const hourDexId = `${hourTime.getTime()}`
  const dex = await getHourDex(hourDexId);

  dex.poolCount = count;
  dex.totalTVL = totalTvl;
  dex.timestamp = timestamp;

  await dex.save();
}

export const createDailyDex = async (count: number, totalTvl: bigint, timestamp: Date) => {
  const dailyTime = getStartOfDay(timestamp);
  const dailyDexId = `${dailyTime.getTime()}`
  const dex = await getDailyDex(dailyDexId);

  dex.poolCount = count;
  dex.totalTVL = totalTvl;
  dex.timestamp = timestamp;

  await dex.save();
}

export const createProvisionToEnableHistory = async (event: SubstrateEvent) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, token0Amount, token1Amount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const blockData = await ensureBlock(event);
  const extrinsicData = await ensureExtrinsic(event);

  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);

  const historyId = `${blockData.hash}-${event.event.index.toString()}`;
  const history = await getProvisionToEnabled(historyId);
  history.poolId = poolId;
  history.token0Id = token0Id;
  history.token1Id = token1Id;
  history.token0Amount = BigInt(token0Amount.toString());
  history.token1Amount = BigInt(token1Amount.toString());
  history.blockId = blockData.id;
  history.extrinsicId = extrinsicData.id;
  history.timestamp = blockData.timestamp;

  await history.save();
}