import { forceToCurrencyName, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { getStartOfDay, getStartOfHour } from "@acala-network/subql-utils";
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import dayjs from "dayjs";
import { ensureBlock, ensureExtrinsic } from ".";
import { DailyPool, HourlyPool } from "../types";
import { getAccount, getDailyDex, getDailyPool, getDex, getHourDex, getHourlyPool, getPool, getSwap, getToken, getTokenDailyData, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const swap = async (event: SubstrateEvent) => {
  const runtimeVersion = Number(event.block.specVersion.toString());
  if (runtimeVersion >= 1008) {
    await swapByRuntimeGt1008(event);
  } else {
    await swapByRuntimeLt1008(event)
  }
  await createSwapHistory(event);
}

const swapByRuntimeLt1008 = async (event: SubstrateEvent) => {
  const [, tradingPath, supplyAmount, targetAmount] = event.event.data as unknown as [AccountId, CurrencyId[], Balance, Balance];
  let nextSupplyAmount = FN.ZERO
  const blockData = await ensureBlock(event);
  const hourTime = getStartOfHour(blockData.timestamp);
  const dailyTime = getStartOfDay(blockData.timestamp);

  for (let i = 0; i < tradingPath.length - 1; i++) {
    const currency0 = tradingPath[i]
    const currency1 = tradingPath[i + 1]

    const supplyTokenName = forceToCurrencyName(currency0)
    const targetTokenName = forceToCurrencyName(currency1)

    const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)
    const token0 = await getToken(token0Name)
    const token1 = await getToken(token1Name)
    const dailyToken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`)
    const dailyToken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`)
    const pool = await getPool(token0Name, token1Name, poolId)

    let token0Amount = '0'
    let token1Amount = '0'

    if (tradingPath.length === 2) {
      token0Amount = token0Name === supplyTokenName ? supplyAmount.toString() : '-' + targetAmount.toString()
      token1Amount = token1Name === supplyTokenName ? supplyAmount.toString() : '-' + targetAmount.toString()
    } else {
      // calculate
      const supplyPool = FN.fromInner(token0Name === supplyTokenName ? pool.token0Amount.toString() : pool.token1Amount.toString())
      const targetPool = FN.fromInner(token0Name === targetTokenName ? pool.token0Amount.toString() : pool.token1Amount.toString())

      const _supplyAmount = i === 0 ? FN.fromInner(supplyAmount.toString()) : nextSupplyAmount

      const targetAmount = targetPool.minus(supplyPool.times(targetPool).div(supplyPool.add((_supplyAmount.times(FN.ONE.minus(FN.fromInner(pool.feeToken0Amount.toString(), 18)))))))

      // update next supply amount
      nextSupplyAmount = targetAmount

      token0Amount = pool.token0Id === supplyTokenName ? _supplyAmount.toChainData() : '-' + targetAmount.toChainData()
      token1Amount = pool.token1Id === supplyTokenName ? _supplyAmount.toChainData() : '-' + targetAmount.toChainData()
    }

    const token0AmountAbs = BigInt(token0Amount) > 0 ? BigInt(token0Amount) : -BigInt(token0Amount);
    const token1AmountAbs = BigInt(token1Amount) > 1 ? BigInt(token1Amount) : -BigInt(token1Amount);

    const price0 = await queryPrice(event, token0Name);
    const price1 = await queryPrice(event, token1Name);

    // update token data
    token0.amount = token0.amount + BigInt(token0Amount);
    token0.tvl = BigInt(FN.fromInner(token0.amount.toString(), token0.decimals).times(price0).toChainData());
    token0.tradeVolume = token0.tradeVolume + token0AmountAbs;
    token0.tradeVolumeUSD = BigInt(FN.fromInner(token0.tradeVolume.toString(), token0.decimals).times(price0).toChainData());
    token0.txCount = token0.txCount + BigInt(1);
    token1.amount = token1.amount + BigInt(token1Amount);
    token1.tvl = BigInt(FN.fromInner(token1.amount.toString(), token1.decimals).times(price1).toChainData());
    token1.tradeVolume = token1.tradeVolume + token1AmountAbs;
    token1.tradeVolumeUSD = BigInt(FN.fromInner(token1.tradeVolume.toString(), token1.decimals).times(price1).toChainData());
    token1.txCount = token1.txCount + BigInt(1);

    dailyToken0.amount = token0.amount;
    dailyToken0.tvl = token0.tvl
    dailyToken0.dailyTradeVolume = dailyToken0.dailyTradeVolume + token0AmountAbs;
    dailyToken0.dailyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(dailyToken0.dailyTradeVolume.toString(), token0.decimals)).toChainData());
    dailyToken0.dailyTxCount = dailyToken0.dailyTxCount + BigInt(1);
    dailyToken0.timestamp = dailyTime;
    dailyToken1.amount = token1.amount;
    dailyToken1.tvl = token1.tvl
    dailyToken1.dailyTradeVolume = dailyToken1.dailyTradeVolume + token1AmountAbs;
    dailyToken1.dailyTradeVolumeUSD = BigInt(price1.times(FN.fromInner(dailyToken1.dailyTradeVolume.toString(), token1.decimals)).toChainData());
    dailyToken1.dailyTxCount = dailyToken1.dailyTxCount + BigInt(1);
    dailyToken1.timestamp = dailyTime;

    await token0.save()
    await token1.save()
    await dailyToken0.save();
    await dailyToken1.save();

    const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).toChainData());
    const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token1AmountAbs.toString(), token1.decimals)).toChainData());
    const oldTotalTVL = pool.totalTVL;

    pool.token0Amount = pool.token0Amount + BigInt(token0Amount);
    pool.token1Amount = pool.token1Amount + BigInt(token1Amount);
    pool.token0Price = BigInt(price0.toChainData());
    pool.token1Price = BigInt(price1.toChainData());
    pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
    pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
    pool.token0TradeVolume = pool.token0TradeVolume + token0AmountAbs;
    pool.token1TradeVolume = pool.token1TradeVolume + token1AmountAbs;
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
    hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + token0AmountAbs;
    hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + token1AmountAbs;
    hourPool.hourlyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(hourPool.hourlyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(hourPool.hourlyToken1TradeVolume.toString(), token1.decimals))).toChainData());
    hourPool.token0TradeVolume = BigInt(token0Amount);
    hourPool.token1TradeVolume = BigInt(token1Amount);
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
    dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + token0AmountAbs;
    dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + token1AmountAbs;
    dailyPool.dailyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token1.decimals))).toChainData())
    dailyPool.token0TradeVolume = BigInt(token0Amount);
    dailyPool.token1TradeVolume = BigInt(token1Amount);
    dailyPool.token0TVL = pool.token0TVL;
    dailyPool.token1TVL = pool.token1TVL;
    dailyPool.txCount = dailyPool.txCount + BigInt(1);
    dailyPool.token0High = dailyPool.token0High > BigInt(price0.toChainData()) ? dailyPool.token0High : BigInt(price0.toChainData());
    dailyPool.token0Low = dailyPool.token0Low < BigInt(price0.toChainData()) ? dailyPool.token0Low : BigInt(price0.toChainData());
    dailyPool.token1High = dailyPool.token1High > BigInt(price1.toChainData()) ? dailyPool.token1High : BigInt(price1.toChainData());
    dailyPool.token1Low = dailyPool.token1Low < BigInt(price1.toChainData()) ? dailyPool.token1Low : BigInt(price1.toChainData());
    await dailyPool.save();

    const tradeVolumeUSD = BigInt(price0.times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).add(price1.times(FN.fromInner(token1AmountAbs.toString(), token1.decimals))).toChainData());

    const dex = await getDex('dex')
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
  }
}

const swapByRuntimeGt1008 = async (event: SubstrateEvent) => {
  // [trader, trading_path, supply_currency_amount, target_currency_amount\]
  const [who, tradingPath, resultPath] = event.event.data as unknown as [AccountId, CurrencyId[], Balance[]];
  const blockData = await ensureBlock(event);
  const hourTime = getStartOfHour(blockData.timestamp);
  const dailyTime = getStartOfDay(blockData.timestamp);

  for (let i = 0; i < tradingPath.length - 1; i++) {
    const currency0 = tradingPath[i]
    const currency1 = tradingPath[i + 1]
    const result0 = resultPath[i]
    const result1 = resultPath[i + 1]

    const supplyTokenName = forceToCurrencyName(currency0)
    const targetTokenName = forceToCurrencyName(currency1)

    const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)
    const token0 = await getToken(token0Name)
    const token1 = await getToken(token1Name)
    const dailyToken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`)
    const dailyToken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`)
    const pool = await getPool(token0Name, token1Name, poolId)
    const dex = await getDex()

    const token0Amount = token0Name === supplyTokenName ? result0.toString() : '-' + result1.toString()
    const token1Amount = token1Name === supplyTokenName ? result0.toString() : '-' + result1.toString()

    const token0AmountAbs = BigInt(token0Amount) > 0 ? BigInt(token0Amount) : -BigInt(token0Amount);
    const token1AmountAbs = BigInt(token1Amount) > 1 ? BigInt(token1Amount) : -BigInt(token1Amount);

    const price0 = await queryPrice(event, token0.name)
    const price1 = await queryPrice(event, token1.name)

    // update token data
    token0.amount = token0.amount + BigInt(token0Amount);
    token0.tvl = BigInt(FN.fromInner(token0.amount.toString(), token0.decimals).times(price0).toChainData());
    token0.tradeVolume = token0.tradeVolume + token0AmountAbs;
    token0.tradeVolumeUSD = BigInt(FN.fromInner(token0.tradeVolume.toString(), token0.decimals).times(price0).toChainData());
    token0.txCount = token0.txCount + BigInt(1);
    token1.amount = token1.amount + BigInt(token1Amount);
    token1.tvl = BigInt(FN.fromInner(token1.amount.toString(), token1.decimals).times(price1).toChainData());
    token1.tradeVolume = token1.tradeVolume + token1AmountAbs;
    token1.tradeVolumeUSD = BigInt(FN.fromInner(token1.tradeVolume.toString(), token1.decimals).times(price1).toChainData());
    token1.txCount = token1.txCount + BigInt(1);

    dailyToken0.amount = token0.amount;
    dailyToken0.tvl = token0.tvl
    dailyToken0.dailyTradeVolume = dailyToken0.dailyTradeVolume + token0AmountAbs;
    dailyToken0.dailyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(dailyToken0.dailyTradeVolume.toString(), token0.decimals)).toChainData());
    dailyToken0.dailyTxCount = dailyToken0.dailyTxCount + BigInt(1);
    dailyToken0.timestamp = dailyTime;
    dailyToken1.amount = token1.amount;
    dailyToken1.tvl = token1.tvl
    dailyToken1.dailyTradeVolume = dailyToken1.dailyTradeVolume + token1AmountAbs;
    dailyToken1.dailyTradeVolumeUSD = BigInt(price1.times(FN.fromInner(dailyToken1.dailyTradeVolume.toString(), token1.decimals)).toChainData());
    dailyToken1.dailyTxCount = dailyToken1.dailyTxCount + BigInt(1);
    dailyToken1.timestamp = dailyTime;

    await token0.save()
    await token1.save()
    await dailyToken0.save();
    await dailyToken1.save();

    const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).toChainData());
    const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token1AmountAbs.toString(), token1.decimals)).toChainData());
    const oldTotalTVL = pool.totalTVL;

    pool.token0Amount = pool.token0Amount + BigInt(token0Amount);
    pool.token1Amount = pool.token1Amount + BigInt(token1Amount);
    pool.token0Price = BigInt(price0.toChainData());
    pool.token1Price = BigInt(price1.toChainData());
    pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
    pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
    pool.token0TradeVolume = pool.token0TradeVolume + token0AmountAbs;
    pool.token1TradeVolume = pool.token1TradeVolume + token1AmountAbs;
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
    hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + token0AmountAbs;
    hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + token1AmountAbs;
    hourPool.hourlyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(hourPool.hourlyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(hourPool.hourlyToken1TradeVolume.toString(), token1.decimals))).toChainData());
    hourPool.token0TradeVolume = BigInt(token0Amount);
    hourPool.token1TradeVolume = BigInt(token1Amount);
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
    dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + token0AmountAbs;
    dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + token1AmountAbs;
    dailyPool.dailyTradeVolumeUSD = BigInt(price0.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token0.decimals)).add(price1.times(FN.fromInner(dailyPool.dailyToken0TradeVolume.toString(), token1.decimals))).toChainData())
    dailyPool.token0TradeVolume = BigInt(token0Amount);
    dailyPool.token1TradeVolume = BigInt(token1Amount);
    dailyPool.token0TVL = pool.token0TVL;
    dailyPool.token1TVL = pool.token1TVL;
    dailyPool.txCount = dailyPool.txCount + BigInt(1);
    dailyPool.token0High = dailyPool.token0High > BigInt(price0.toChainData()) ? dailyPool.token0High : BigInt(price0.toChainData());
    dailyPool.token0Low = dailyPool.token0Low < BigInt(price0.toChainData()) ? dailyPool.token0Low : BigInt(price0.toChainData());
    dailyPool.token1High = dailyPool.token1High > BigInt(price1.toChainData()) ? dailyPool.token1High : BigInt(price1.toChainData());
    dailyPool.token1Low = dailyPool.token1Low < BigInt(price1.toChainData()) ? dailyPool.token1Low : BigInt(price1.toChainData());
    await dailyPool.save();

    const tradeVolumeUSD = BigInt(price0.times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).add(price1.times(FN.fromInner(token1AmountAbs.toString(), token1.decimals))).toChainData());

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
  }
}

const createSwapHistory = async (event: SubstrateEvent) => {
  const runtimeVersion = Number(event.block.specVersion.toString());
  let supplyAmount: Balance
  let targetAmount: Balance
  let tradingPath: CurrencyId[]
  let who: AccountId

  if (runtimeVersion >= 1008) {
    const [_who, _tradingPath, resultPath] = event.event
      .data as unknown as [AccountId, CurrencyId[], Balance[]]

    who = _who
    supplyAmount = resultPath[0]
    targetAmount = resultPath[resultPath.length - 1]
    tradingPath = _tradingPath
  } else {
    const [_who, _tradingPath, _supplyAmount, _targetAmount] = event.event
      .data as unknown as [AccountId, CurrencyId[], Balance, Balance]

    who = _who
    supplyAmount = _supplyAmount
    targetAmount = _targetAmount
    tradingPath = _tradingPath
  }

  const blockData = await ensureBlock(event);
  const extrinsicData = await ensureExtrinsic(event);

  const currency0 = tradingPath[0]
  const currency1 = tradingPath[tradingPath.length - 1]
  const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1)

  const historyId = `${blockData.hash}-${event.event.index.toString()}`;
  const history = await getSwap(historyId);

  history.addressId = who.toString();
  history.poolId = poolId;
  history.token0Id = token0Name;
  history.token1Id = token1Name;

  await getAccount(event.extrinsic.extrinsic.signer.toString());

  extrinsicData.section = event.event.section;
  extrinsicData.method = event.event.method;
  extrinsicData.addressId = event.extrinsic.extrinsic.signer.toString();

  await extrinsicData.save();
  await history.save()
}