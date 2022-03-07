import { forceToCurrencyName, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { getStartOfDay, getStartOfHour } from "@acala-network/subql-utils";
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import dayjs from "dayjs";
import { async } from "rxjs";
import { ensureBlock, ensureExtrinsic } from ".";
import { getAddLiquidity, getDailyDex, getDailyPool, getDex, getHourDex, getHourlyPool, getPool, getToken, getTokenDailyData, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const addLiquidity = async (event: SubstrateEvent) => {
  // [who, currency_id_0, pool_0_increment, currency_id_1, pool_1_increment, share_increment\]
  const [owner, currency0, pool0Increment, currency1, pool1Increment] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
  const blockData = await ensureBlock(event);
  const extrinsicData = await ensureExtrinsic(event);

  const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)
  const token0Increment = (token0Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()
  const token1Increment = (token1Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()

  const price0 = await queryPrice(event, token0Name);
  const price1 = await queryPrice(event, token1Name);

  const pool = await getPool(token0Name, token1Name, poolId);
  const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(new FN(token0Increment)).toChainData());
  const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(new FN(token1Increment)).toChainData());
  const oldTotalTVL = pool.totalTVL;

  pool.token0Amount = pool.token0Amount + BigInt(token0Increment);
  pool.token1Amount = pool.token1Amount + BigInt(token1Increment);
  pool.token0Price = BigInt(price0.toChainData());
  pool.token1Price = BigInt(price1.toChainData());
  pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
  pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
  pool.token0TradeVolume = pool.token0TradeVolume + BigInt(token0Increment);
  pool.token1TradeVolume = pool.token1TradeVolume + BigInt(token1Increment);
  pool.tradeVolumeUSD = BigInt(new FN(pool.token0TradeVolume.toString()).times(price0).add(new FN(pool.token1TradeVolume.toString()).times(price1)).toChainData());
  pool.token0TVL = BigInt(new FN(pool.token0Amount.toString()).times(price0).toChainData());
  pool.token1TVL = BigInt(new FN(pool.token1Amount.toString()).times(price1).toChainData());
  pool.totalTVL = pool.token0TVL + pool.token1TVL;
  pool.txCount = pool.txCount + BigInt(1);

  await pool.save();
  await updateToken(event, token0Name, token1Name, token0Increment, token1Increment, price0, price1);

  const hourTime = getStartOfHour(blockData.timestamp);
  const hourPoolId = `${token0Name}-${token1Name}-${hourTime.getTime()}`;
  const hourPool = await getHourlyPool(hourPoolId);
  //when create a new hourly pool schema, need to update 'token*close' for the previous time period
  if(hourPool.token0Id == '' && hourPool.token1Id === '' && hourPool.poolId === '') {
    const preHourTime = getStartOfHour(dayjs(blockData.timestamp).subtract(1, 'hour').toDate());
    const preHourPoolId = `${token0Name}-${token1Name}-${preHourTime.getTime()}`;
    const preHourPool = await getHourlyPool(preHourPoolId);
    preHourPool.token0Close = BigInt(price0.toChainData());
    preHourPool.token1Close = BigInt(price1.toChainData());

    await preHourPool.save()
  }
  hourPool.poolId = poolId;
  hourPool.timestamp = hourTime;
  hourPool.token0Id = token0Name;
  hourPool.token1Id = token1Name;
  hourPool.token0Amount = pool.token0Amount;
  hourPool.token1Amount = pool.token1Amount;
  hourPool.token0Price = BigInt(price0.toChainData());
  hourPool.token1Price = BigInt(price1.toChainData());
  hourPool.feeVolumeUSD = hourPool.feeVolumeUSD + token0fee + token1fee;
  hourPool.feeToken0Amount = hourPool.feeToken0Amount + token0fee;
  hourPool.feeToken1Amount = hourPool.feeToken1Amount + token1fee;
  hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + BigInt(token0Increment);
  hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + BigInt(token1Increment);
  hourPool.hourlyTradeVolumeUSD = hourPool.hourlyTradeVolumeUSD + BigInt(new FN(hourPool.hourlyToken0TradeVolume.toString()).times(price0).toChainData()) + BigInt(new FN(hourPool.hourlyToken1TradeVolume.toString()).times(price1).toChainData());
  hourPool.token0TradeVolume = BigInt(token0Increment);
  hourPool.token1TradeVolume = BigInt(token1Increment);
  hourPool.token0TVL = BigInt(new FN(hourPool.token0Amount.toString()).times(price0).toString());
  hourPool.token1TVL = BigInt(new FN(hourPool.token1Amount.toString()).times(price1).toString());
  hourPool.txCount = hourPool.txCount + BigInt(1);
  hourPool.token0High = hourPool.token0High > BigInt(price0.toString()) ? hourPool.token0High : BigInt(price0.toChainData());
  hourPool.token0Low = hourPool.token0Low < BigInt(price0.toString()) ? hourPool.token0High : BigInt(price0.toChainData());
  hourPool.token1High = hourPool.token1High > BigInt(price1.toString()) ? hourPool.token1High : BigInt(price1.toChainData());
  hourPool.token1Low = hourPool.token1Low < BigInt(price1.toString()) ? hourPool.token1High : BigInt(price1.toChainData());
  await hourPool.save();

  const dailyTime = getStartOfHour(blockData.timestamp);
  const dailyPoolId = `${token0Name}-${token1Name}-${dailyTime.getTime()}`;
  const dailyPool = await getDailyPool(dailyPoolId);
  //when create a new daily pool schema, need to update 'token*close' for the previous time period
  if(dailyPool.token0Id == '' && dailyPool.token1Id === '' && dailyPool.poolId === '') {
    const preDailyTime = getStartOfHour(dayjs(blockData.timestamp).subtract(1, 'day').toDate());
    const preDailyPoolId = `${token0Name}-${token1Name}-${preDailyTime.getTime()}`;
    const preDailyPool = await getHourlyPool(preDailyPoolId);
    preDailyPool.token0Close = BigInt(price0.toChainData());
    preDailyPool.token1Close = BigInt(price1.toChainData());

    await preDailyPool.save()
  }
  dailyPool.poolId = poolId;
  dailyPool.timestamp = dailyTime;
  dailyPool.token0Id = token0Name;
  dailyPool.token1Id = token1Name;
  dailyPool.token0Amount = pool.token0Amount;
  dailyPool.token1Amount = pool.token1Amount;
  dailyPool.token0Price = BigInt(price0.toChainData());
  dailyPool.token1Price = BigInt(price1.toChainData());
  dailyPool.feeVolumeUSD = dailyPool.feeVolumeUSD + token0fee + token1fee;
  dailyPool.feeToken0Amount = dailyPool.feeToken0Amount + token0fee;
  dailyPool.feeToken1Amount = dailyPool.feeToken1Amount + token1fee;
  dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + BigInt(token0Increment);
  dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + BigInt(token1Increment);
  dailyPool.dailyTradeVolumeUSD = dailyPool.dailyTradeVolumeUSD + BigInt(new FN(dailyPool.dailyToken0TradeVolume.toString()).times(price0).toChainData()) + BigInt(new FN(dailyPool.dailyToken1TradeVolume.toString()).times(price1).toChainData());
  dailyPool.token0TradeVolume = BigInt(token0Increment);
  dailyPool.token1TradeVolume = BigInt(token1Increment);
  dailyPool.token0TVL = BigInt(new FN(dailyPool.token0Amount.toString()).times(price0).toString());
  dailyPool.token1TVL = BigInt(new FN(dailyPool.token1Amount.toString()).times(price1).toString());
  dailyPool.txCount = dailyPool.txCount + BigInt(1);
  dailyPool.token0High = dailyPool.token0High > BigInt(price0.toString()) ? dailyPool.token0High : BigInt(price0.toChainData());
  dailyPool.token0Low = dailyPool.token0Low < BigInt(price0.toString()) ? dailyPool.token0High : BigInt(price0.toChainData());
  dailyPool.token1High = dailyPool.token1High > BigInt(price1.toString()) ? dailyPool.token1High : BigInt(price1.toChainData());
  dailyPool.token1Low = dailyPool.token1Low < BigInt(price1.toString()) ? dailyPool.token1High : BigInt(price1.toChainData());
  await dailyPool.save();
  
  const tradeVolumeUSD = BigInt(new FN(token0Increment.toString()).times(price0).toChainData()) + BigInt(new FN(token1Increment.toString()).times(price1).toChainData());

  const dex = await getDex('dex');
  dex.tradeVolumeUSD = dex.tradeVolumeUSD + tradeVolumeUSD
  dex.totalTVL = dex.totalTVL + pool.totalTVL - oldTotalTVL;
  await dex.save();

  const hourDexTime = getStartOfHour(blockData.timestamp);
  const hourDex = await getHourDex(hourDexTime.getTime().toString());
  hourDex.hourlyTradeVolumeUSD = hourDex.hourlyTradeVolumeUSD + tradeVolumeUSD;
  hourDex.tradeVolumeUSD = dex.tradeVolumeUSD;
  hourDex.totalTVL = dex.totalTVL;
  hourDex.timestamp = hourDexTime;
  await hourDex.save();

  const dailyDexTime = getStartOfHour(blockData.timestamp);
  const dailyDex = await getDailyDex(dailyDexTime.getTime().toString());
  dailyDex.dailyTradeVolumeUSD = dailyDex.dailyTradeVolumeUSD + tradeVolumeUSD;
  dailyDex.tradeVolumeUSD = dex.tradeVolumeUSD;
  dailyDex.totalTVL = dex.totalTVL;
  dailyDex.timestamp = dailyDexTime;
  await dailyDex.save();

  await createAddLiquidyHistory(event, price0, price1);
}

const updateToken = async (event: SubstrateEvent,token0Name: string, token1Name: string, token0Increment: string, token1Increment: string, price0: FN, price1: FN) => {
  const token0 = await getToken(token0Name);
  const token1 = await getToken(token1Name);

  token0.amount = token0.amount + BigInt(token0Increment);
  token0.tvl = BigInt(new FN(token0.amount.toString()).times(price0).toChainData());
  token0.tradeVolume = token0.tradeVolume + BigInt(token0Increment) > 0 ? BigInt(token0Increment) : -BigInt(token0Increment);
  token0.tradeVolumeUSD = BigInt(new FN(token0.tradeVolume.toString()).times(price0).toChainData());
  token0.txCount = token0.txCount + BigInt(1);
  token1.amount = token1.amount + BigInt(token1Increment);
  token1.tvl = BigInt(new FN(token1.amount.toString()).times(price1).toChainData());
  token1.tradeVolume = token1.tradeVolume + BigInt(token1Increment) > 0 ? BigInt(token1Increment) : -BigInt(token1Increment);
  token1.tradeVolumeUSD = BigInt(new FN(token1.tradeVolume.toString()).times(price1).toChainData());
  token1.txCount = token1.txCount + BigInt(1);

  const dailyTime = getStartOfDay(event.block.timestamp);
  const Dailytoken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`);
  const Dailytoken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`);

  Dailytoken0.amount = token0.amount;
  Dailytoken0.tvl = token0.tvl
  Dailytoken0.dailyTradeVolume = Dailytoken0.dailyTradeVolume + BigInt(token0Increment) > 0 ? BigInt(token0Increment) : -BigInt(token0Increment);
  Dailytoken0.dailyTradeVolumeUSD = BigInt(new FN(Dailytoken0.dailyTradeVolume.toString()).times(price0).toChainData());
  Dailytoken0.dailyTxCount = Dailytoken0.dailyTxCount + BigInt(1);
  Dailytoken0.timestamp = event.block.timestamp;
  Dailytoken1.amount = token1.amount;
  Dailytoken1.tvl = token1.tvl
  Dailytoken1.dailyTradeVolume = Dailytoken1.dailyTradeVolume + BigInt(token1Increment) > 0 ? BigInt(token1Increment) : -BigInt(token1Increment);
  Dailytoken1.dailyTradeVolumeUSD = BigInt(new FN(Dailytoken1.dailyTradeVolume.toString()).times(price1).toChainData());
  Dailytoken1.dailyTxCount = Dailytoken1.dailyTxCount + BigInt(1);
  Dailytoken1.timestamp = event.block.timestamp;

  await token0.save();
  await token1.save();
  await Dailytoken0.save();
  await Dailytoken1.save();

  return {
    token0, token1
  }
}

export const createAddLiquidyHistory = async (event: SubstrateEvent, price0: FN, price1: FN) => {
   // [who, currency_id_0, pool_0_increment, currency_id_1, pool_1_increment, share_increment\]
   const [owner, currency0, pool0Increment, currency1, pool1Increment] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
   const blockData = await ensureBlock(event);
   const extrinsicData = await ensureExtrinsic(event);

   const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)
   const token0Increment = (token0Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()
   const token1Increment = (token1Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()

  const historyId = `${blockData.hash}-${event.event.index.toString()}`;
  const history = await getAddLiquidity(historyId);
  history.addressId = owner.toString();
  history.poolId = poolId;
  history.token0Id = token0Name;
  history.token1Id = token1Name;
  history.token0Amount = BigInt(token0Increment.toString());
  history.token1Amount = BigInt(token1Increment.toString());
  history.price0 = BigInt(price0.toChainData());
  history.price1 = BigInt(price1.toChainData());
  history.blockId = blockData.id;
  history.extrinsicId = extrinsicData.id;
  history.timestamp = blockData.timestamp;

  await history.save(); 
}