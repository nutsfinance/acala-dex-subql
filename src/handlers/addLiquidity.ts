import { forceToCurrencyName, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { getStartOfDay, getStartOfHour } from "@acala-network/subql-utils";
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import dayjs from "dayjs";
import { ensureBlock, ensureExtrinsic } from ".";
import { DailyPool, HourlyPool } from "../types";
import { getAccount, getAddLiquidity, getDailyDex, getDailyPool, getDex, getHourDex, getHourlyPool, getPool, getToken, getTokenDailyData, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const addLiquidity = async (event: SubstrateEvent) => {
  // [who, currency_id_0, pool_0_increment, currency_id_1, pool_1_increment, share_increment\]
  const [owner, currency0, pool0Increment, currency1, pool1Increment] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
  const blockData = await ensureBlock(event);

  const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)
  const token0Increment = (token0Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()
  const token1Increment = (token1Name === forceToCurrencyName(currency0) ? pool0Increment : pool1Increment).toString()
  const price0 = await queryPrice(event, token0Name);
  const price1 = await queryPrice(event, token1Name);
  const hourTime = getStartOfHour(blockData.timestamp);
  const dailyTime = getStartOfHour(blockData.timestamp);

  const { token0, token1 } = await updateToken(event, poolId, token0Name, token1Name, token0Increment, token1Increment, price0, price1);

  const pool = await getPool(token0Name, token1Name, poolId);
  const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token0Increment, token0.decimals)).toChainData());
  const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token1Increment, token1.decimals)).toChainData());
  const oldTotalTVL = pool.totalTVL;

  pool.token0Amount = pool.token0Amount + BigInt(token0Increment);
  pool.token1Amount = pool.token1Amount + BigInt(token1Increment);
  pool.token0Price = BigInt(price0.toChainData());
  pool.token1Price = BigInt(price1.toChainData());
  pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
  pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
  pool.token0TradeVolume = pool.token0TradeVolume + BigInt(token0Increment);
  pool.token1TradeVolume = pool.token1TradeVolume + BigInt(token1Increment);
  pool.tradeVolumeUSD = BigInt(price0.times(FN.fromInner(pool.token0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(pool.token1TradeVolume.toString(), token1.decimals))).toChainData());
  pool.token0TVL = BigInt(price0.times(FN.fromInner(pool.token0Amount.toString())).toChainData());
  pool.token1TVL = BigInt(price1.times(FN.fromInner(pool.token1Amount.toString())).toChainData());
  pool.totalTVL = pool.token0TVL + pool.token1TVL;
  pool.txCount = pool.txCount + BigInt(1);
  await pool.save();

  const hourPoolId = `${poolId}-${hourTime.getTime()}`;
  const hourPool = await getHourlyPool(hourPoolId);
  //when create a new hourly pool schema, need to update 'token*close' for the previous time period
  if (hourPool.token0Id == '' && hourPool.token1Id === '' && hourPool.poolId === '') {
    const preHourTime = getStartOfHour(dayjs(blockData.timestamp).subtract(1, 'hour').toDate());
    const preHourPoolId = `${poolId}-${preHourTime.getTime()}`;
    const preHourPool = await HourlyPool.get(preHourPoolId);
    if (preHourPool) {
      preHourPool.token0Close = BigInt(price0.toChainData());
      preHourPool.token1Close = BigInt(price1.toChainData());

      await preHourPool.save()
    }
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
  hourPool.hourlyTradeVolumeUSD = hourPool.hourlyTradeVolumeUSD + BigInt(price0.times(FN.fromInner(hourPool.hourlyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(hourPool.hourlyToken1TradeVolume.toString(), token1.decimals))).toChainData());
  hourPool.token0TradeVolume = BigInt(token0Increment);
  hourPool.token1TradeVolume = BigInt(token1Increment);
  hourPool.token0TVL = pool.token0TVL;
  hourPool.token1TVL = pool.token1TVL;
  hourPool.txCount = hourPool.txCount + BigInt(1);
  hourPool.token0High = hourPool.token0High > BigInt(price0.toChainData()) ? hourPool.token0High : BigInt(price0.toChainData());
  hourPool.token0Low = hourPool.token0Low < BigInt(price0.toChainData()) ? hourPool.token0Low : BigInt(price0.toChainData());
  hourPool.token1High = hourPool.token1High > BigInt(price1.toChainData()) ? hourPool.token1High : BigInt(price1.toChainData());
  hourPool.token1Low = hourPool.token1Low < BigInt(price1.toChainData()) ? hourPool.token1Low : BigInt(price1.toChainData());
  await hourPool.save();

  const dailyPoolId = `${poolId}-${dailyTime.getTime()}`;
  const dailyPool = await getDailyPool(dailyPoolId);
  //when create a new daily pool schema, need to update 'token*close' for the previous time period
  if (dailyPool.token0Id == '' && dailyPool.token1Id === '' && dailyPool.poolId === '') {
    const preDailyTime = getStartOfDay(dayjs(blockData.timestamp).subtract(1, 'day').toDate());
    const preDailyPoolId = `${poolId}-${preDailyTime.getTime()}`;
    const preDailyPool = await DailyPool.get(preDailyPoolId);
    if (preDailyPool) {
      preDailyPool.token0Close = BigInt(price0.toChainData());
      preDailyPool.token1Close = BigInt(price1.toChainData());

      await preDailyPool.save()
    }
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
  dailyPool.dailyTradeVolumeUSD = dailyPool.dailyTradeVolumeUSD + BigInt(price0.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token1.decimals))).toChainData())
  dailyPool.token0TradeVolume = BigInt(token0Increment);
  dailyPool.token1TradeVolume = BigInt(token1Increment);
  dailyPool.token0TVL = pool.token0TVL;
  dailyPool.token1TVL = pool.token1TVL;
  dailyPool.txCount = dailyPool.txCount + BigInt(1);
  dailyPool.token0High = dailyPool.token0High > BigInt(price0.toChainData()) ? dailyPool.token0High : BigInt(price0.toChainData());
  dailyPool.token0Low = dailyPool.token0Low < BigInt(price0.toChainData()) ? dailyPool.token0Low : BigInt(price0.toChainData());
  dailyPool.token1High = dailyPool.token1High > BigInt(price1.toChainData()) ? dailyPool.token1High : BigInt(price1.toChainData());
  dailyPool.token1Low = dailyPool.token1Low < BigInt(price1.toChainData()) ? dailyPool.token1Low : BigInt(price1.toChainData());
  await dailyPool.save();

  const tradeVolumeUSD = BigInt(price0.times(FN.fromInner(token0Increment, token0.decimals)).add(price1.times(FN.fromInner(token1Increment, token1.decimals))).toChainData());

  const dex = await getDex('dex');
  dex.tradeVolumeUSD = dex.tradeVolumeUSD + tradeVolumeUSD
  dex.totalTVL = dex.totalTVL + pool.totalTVL - oldTotalTVL;
  await dex.save();

  const hourDex = await getHourDex(hourTime.getTime().toString());
  hourDex.hourlyTradeVolumeUSD = hourDex.hourlyTradeVolumeUSD + tradeVolumeUSD;
  hourDex.tradeVolumeUSD = dex.tradeVolumeUSD;
  hourDex.totalTVL = dex.totalTVL;
  hourDex.timestamp = hourTime;
  await hourDex.save();

  const dailyDex = await getDailyDex(dailyTime.getTime().toString());
  dailyDex.dailyTradeVolumeUSD = dailyDex.dailyTradeVolumeUSD + tradeVolumeUSD;
  dailyDex.tradeVolumeUSD = dex.tradeVolumeUSD;
  dailyDex.totalTVL = dex.totalTVL;
  dailyDex.timestamp = dailyTime;
  await dailyDex.save();

  await createAddLiquidyHistory(event, price0, price1);
}

const updateToken = async (event: SubstrateEvent, poolId: string, token0Name: string, token1Name: string, token0Increment: string, token1Increment: string, price0: FN, price1: FN) => {
  const token0 = await getToken(token0Name);
  const token1 = await getToken(token1Name);
  const poolToken = await getToken(poolId);

  token0.amount = token0.amount + BigInt(token0Increment);
  token0.tvl = BigInt(price0.times(FN.fromInner(token0.amount.toString(), token0.decimals)).toChainData());
  token0.tradeVolume = token0.tradeVolume + (BigInt(token0Increment) > 0 ? BigInt(token0Increment) : -BigInt(token0Increment));
  token0.tradeVolumeUSD = BigInt(price0.times(FN.fromInner(token0.tradeVolume.toString(), token0.decimals)).toChainData());
  token0.txCount = token0.txCount + BigInt(1);
  token1.amount = token1.amount + BigInt(token1Increment);
  token1.tvl = BigInt(price1.times(FN.fromInner(token1.amount.toString(), token1.decimals)).toChainData());
  token1.tradeVolume = token1.tradeVolume + (BigInt(token1Increment) > 0 ? BigInt(token1Increment) : -BigInt(token1Increment));
  token1.tradeVolumeUSD = BigInt(price1.times(FN.fromInner(token1.tradeVolume.toString(), token1.decimals)).toChainData());
  token1.txCount = token1.txCount + BigInt(1);

  poolToken.amount = poolToken.amount + BigInt(token0Increment) + BigInt(token1Increment)
  poolToken.tvl = token0.tvl + token1.tvl;
  poolToken.tradeVolume = poolToken.tradeVolume + token0.tradeVolume + token1.tradeVolume
  poolToken.tradeVolumeUSD = token0.tradeVolumeUSD + token1.tradeVolumeUSD;
  poolToken.txCount = poolToken.txCount + BigInt(1);

  const dailyTime = getStartOfDay(event.block.timestamp);
  const Dailytoken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`);
  const Dailytoken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`);
  const DailyPoolToken = await getTokenDailyData(`${poolId}-${dailyTime.getTime()}`);

  Dailytoken0.amount = token0.amount;
  Dailytoken0.tvl = token0.tvl
  Dailytoken0.dailyTradeVolume = Dailytoken0.dailyTradeVolume + (BigInt(token0Increment) > 0 ? BigInt(token0Increment) : -BigInt(token0Increment));
  Dailytoken0.dailyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(Dailytoken0.dailyTradeVolume.toString(), token0.decimals)).toChainData());
  Dailytoken0.dailyTxCount = Dailytoken0.dailyTxCount + BigInt(1);
  Dailytoken0.timestamp = getStartOfDay(event.block.timestamp);
  Dailytoken1.amount = token1.amount;
  Dailytoken1.tvl = token1.tvl
  Dailytoken1.dailyTradeVolume = Dailytoken1.dailyTradeVolume + (BigInt(token1Increment) > 0 ? BigInt(token1Increment) : -BigInt(token1Increment));
  Dailytoken1.dailyTradeVolumeUSD = BigInt(price1.times(FN.fromInner(Dailytoken1.dailyTradeVolume.toString(), token1.decimals)).toChainData());
  Dailytoken1.dailyTxCount = Dailytoken1.dailyTxCount + BigInt(1);
  Dailytoken1.timestamp = getStartOfDay(event.block.timestamp);

  DailyPoolToken.amount = token1.amount + token0.amount;
  DailyPoolToken.tvl = token1.tvl + token0.tvl
  DailyPoolToken.dailyTradeVolume = DailyPoolToken.dailyTradeVolume + (BigInt(token1Increment) > 0 ? BigInt(token1Increment) : -BigInt(token1Increment)) + (BigInt(token0Increment) > 0 ? BigInt(token0Increment) : -BigInt(token0Increment));
  DailyPoolToken.dailyTradeVolumeUSD = BigInt(price1.times(FN.fromInner(DailyPoolToken.dailyTradeVolume.toString(), poolToken.decimals)).toChainData());
  DailyPoolToken.dailyTxCount = DailyPoolToken.dailyTxCount + BigInt(1);
  DailyPoolToken.timestamp = getStartOfDay(event.block.timestamp);

  await token0.save();
  await token1.save();
  await poolToken.save();
  await Dailytoken0.save();
  await Dailytoken1.save();
  await DailyPoolToken.save();

  return { token0, token1 }
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

  await getAccount(event.extrinsic.extrinsic.signer.toString());
  
  extrinsicData.section = event.event.section;
  extrinsicData.method = event.event.method;
  extrinsicData.addressId = event.extrinsic.extrinsic.signer.toString();

  await extrinsicData.save();
  await history.save();
}