import { forceToCurrencyName, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import { ensureBlock, ensureExtrinsic } from ".";
import { getAccount, getDailyDex, getDailyPool, getDex, getHourDex, getHourlyPool, getPool, getStartOfDay, getStartOfHour, getSwap, getToken, getTokenDailyData, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const swap = async (event: SubstrateEvent) => {
	const dataLength = event.event.data.length;
	if (dataLength === 3) {
		await swapByRuntimeGt1008(event);
	} else {
		await swapByRuntimeLt1008(event);
	}
};

const swapByRuntimeLt1008 = async (event: SubstrateEvent) => {
	const [owner, tradingPath, supplyAmount, targetAmount] = event.event.data as unknown as [AccountId, CurrencyId[], Balance, Balance];
	let nextSupplyAmount = BigInt(0);
	const blockData = await ensureBlock(event);
	const hourTime = getStartOfHour(blockData.timestamp);
	const dailyTime = getStartOfDay(blockData.timestamp);

	for (let i = 0; i < tradingPath.length - 1; i++) {
		const currency0 = tradingPath[i];
		const currency1 = tradingPath[i + 1];

		const supplyTokenName = forceToCurrencyName(currency0);
		const targetTokenName = forceToCurrencyName(currency1);

		const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1);
		const token0 = await getToken(token0Name);
		const token1 = await getToken(token1Name);
		await getToken(poolId);
		const dailyToken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`);
		const dailyToken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`);
		const pool = await getPool(token0Name, token1Name, poolId);

		let token0Amount = BigInt(0);
		let token1Amount = BigInt(0);

		if (tradingPath.length === 2) {
			token0Amount = token0Name === supplyTokenName ? BigInt(0) : - BigInt(targetAmount.toString());
			token1Amount = token1Name === supplyTokenName ? BigInt(0) : - BigInt(targetAmount.toString());
		} else {
			// calculate
			const supplyPool = token0Name === supplyTokenName ? BigInt(pool.token0Amount.toString()) : BigInt(pool.token1Amount.toString());
			const targetPool = token0Name === targetTokenName ? BigInt(pool.token0Amount.toString()) : BigInt(pool.token1Amount.toString());

			const _supplyAmount = i === 0 ? BigInt(supplyAmount.toString()) : nextSupplyAmount;

			const targetAmount = targetPool - (supplyPool * targetPool / (supplyPool + _supplyAmount * (BigInt(1) - BigInt(pool.feeToken0Amount))));

			// update next supply amount
			nextSupplyAmount = targetAmount;

			token0Amount = pool.token0Id === supplyTokenName ? _supplyAmount : -targetAmount;
			token1Amount = pool.token1Id === supplyTokenName ? _supplyAmount : -targetAmount;
		}
		const oldPrice0 = await queryPrice(token0Name);
		const oldPrice1 = await queryPrice(token1Name);

		const token0AmountAbs = BigInt(token0Amount) > 0 ? BigInt(token0Amount) : -BigInt(token0Amount);
		const token1AmountAbs = BigInt(token1Amount) > 0 ? BigInt(token1Amount) : -BigInt(token1Amount);
		const token0ChangedUSD = oldPrice0.times(FN.fromInner(token0AmountAbs.toString(), token0.decimals))
		const token1ChangedUSD = oldPrice1.times(FN.fromInner(token1AmountAbs.toString(), token1.decimals))
		token0ChangedUSD.setPrecision(18)
		token1ChangedUSD.setPrecision(18)

		const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).toChainData());
		const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token1AmountAbs.toString(), token1.decimals)).toChainData());
		const oldTotalTVL = pool.totalTVL;

		pool.token0Amount = pool.token0Amount + BigInt(token0Amount);
		pool.token1Amount = pool.token1Amount + BigInt(token1Amount);
		pool.token0Price = BigInt(oldPrice0.toChainData())
		pool.token1Price = BigInt(oldPrice1.toChainData())
		pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
		pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
		pool.token0TradeVolume = pool.token0TradeVolume + token0AmountAbs;
		pool.token1TradeVolume = pool.token1TradeVolume + token1AmountAbs;
		pool.tradeVolumeUSD = pool.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		pool.txCount = pool.txCount + BigInt(1);
		await pool.save();

		const newPrice0 = await queryPrice(token0Name);
		const newPrice1 = await queryPrice(token1Name);

		const newPool = await getPool(token0Name, token1Name, poolId);
		newPool.token0TVL = BigInt(newPrice0.times(FN.fromInner(newPool.token0Amount.toString(), token0.decimals)).toChainData());
		newPool.token1TVL = BigInt(newPrice1.times(FN.fromInner(newPool.token1Amount.toString(), token1.decimals)).toChainData());
		newPool.totalTVL = newPool.token0TVL + newPool.token1TVL;
		await newPool.save();

		const hourPoolId = `${poolId}-${hourTime.getTime()}`;
		const hourPool = await getHourlyPool(hourPoolId);
		hourPool.poolId = poolId;
		hourPool.timestamp = hourTime;
		hourPool.token0Id = token0Name;
		hourPool.token1Id = token1Name;
		hourPool.token0Amount = newPool.token0Amount;
		hourPool.token1Amount = newPool.token1Amount;
		hourPool.token0Price = BigInt(newPrice0.toChainData())
		hourPool.token1Price = BigInt(newPrice1.toChainData())
		hourPool.feeVolumeUSD = hourPool.feeVolumeUSD + token0fee + token1fee;
		hourPool.feeToken0Amount = hourPool.feeToken0Amount + token0fee;
		hourPool.feeToken1Amount = hourPool.feeToken1Amount + token1fee;
		hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + token0AmountAbs;
		hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + token1AmountAbs;
		hourPool.hourlyTradeVolumeUSD = hourPool.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		hourPool.token0TradeVolume = BigInt(token0AmountAbs);
		hourPool.token1TradeVolume = BigInt(token1AmountAbs);
		hourPool.token0TVL = newPool.token0TVL;
		hourPool.token1TVL = newPool.token1TVL;
		hourPool.txCount = hourPool.txCount + BigInt(1);
		hourPool.token0High = hourPool.token0High > BigInt(newPrice0.toChainData()) ? hourPool.token0High : BigInt(newPrice0.toChainData());
		hourPool.token0Low = hourPool.token0Low < BigInt(newPrice0.toChainData()) ? hourPool.token0Low : BigInt(newPrice0.toChainData());
		hourPool.token0Close = BigInt(newPrice0.toChainData());
		hourPool.token1High = hourPool.token1High > BigInt(newPrice1.toChainData()) ? hourPool.token1High : BigInt(newPrice1.toChainData());
		hourPool.token1Low = hourPool.token1Low < BigInt(newPrice1.toChainData()) ? hourPool.token1Low : BigInt(newPrice1.toChainData());
		hourPool.token1Close = BigInt(newPrice1.toChainData());
		hourPool.updateAtBlockId = blockData.id;
		await hourPool.save();

		const dailyPoolId = `${poolId}-${dailyTime.getTime()}`;
		const dailyPool = await getDailyPool(dailyPoolId);
		dailyPool.poolId = poolId;
		dailyPool.timestamp = dailyTime;
		dailyPool.token0Id = token0Name;
		dailyPool.token1Id = token1Name;
		dailyPool.token0Amount = newPool.token0Amount;
		dailyPool.token1Amount = newPool.token1Amount;
		dailyPool.token0Price = BigInt(newPrice0.toChainData())
		dailyPool.token1Price = BigInt(newPrice1.toChainData())
		dailyPool.feeVolumeUSD = dailyPool.feeVolumeUSD + token0fee + token1fee;
		dailyPool.feeToken0Amount = dailyPool.feeToken0Amount + token0fee;
		dailyPool.feeToken1Amount = dailyPool.feeToken1Amount + token1fee;
		dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + token0AmountAbs;
		dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + token1AmountAbs;
		dailyPool.dailyTradeVolumeUSD = dailyPool.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dailyPool.token0TradeVolume = BigInt(token0AmountAbs);
		dailyPool.token1TradeVolume = BigInt(token1AmountAbs);
		dailyPool.token0TVL = newPool.token0TVL;
		dailyPool.token1TVL = newPool.token1TVL;
		dailyPool.totalTVL = dailyPool.token0TVL + dailyPool.token1TVL;
		dailyPool.txCount = dailyPool.txCount + BigInt(1);
		dailyPool.token0High = dailyPool.token0High > BigInt(newPrice0.toChainData()) ? dailyPool.token0High : BigInt(newPrice0.toChainData());
		dailyPool.token0Low = dailyPool.token0Low < BigInt(newPrice0.toChainData()) ? dailyPool.token0Low : BigInt(newPrice0.toChainData());
		dailyPool.token0Close = BigInt(newPrice0.toChainData());
		dailyPool.token1High = dailyPool.token1High > BigInt(newPrice1.toChainData()) ? dailyPool.token1High : BigInt(newPrice1.toChainData());
		dailyPool.token1Low = dailyPool.token1Low < BigInt(newPrice1.toChainData()) ? dailyPool.token1Low : BigInt(newPrice1.toChainData());
		dailyPool.token1Close = BigInt(newPrice1.toChainData());
		dailyPool.updateAtBlockId = blockData.id;
		await dailyPool.save();

		const dex = await getDex("dex");
		dex.tradeVolumeUSD = dex.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dex.totalTVL = dex.totalTVL + newPool.totalTVL - oldTotalTVL;
		await dex.save();

		const hourDex = await getHourDex(hourTime.getTime().toString());
		hourDex.hourlyTradeVolumeUSD = hourDex.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		hourDex.tradeVolumeUSD = dex.tradeVolumeUSD;
		hourDex.totalTVL = dex.totalTVL;
		hourDex.timestamp = hourTime;
		hourDex.updateAtBlockId = blockData.id;
		await hourDex.save();

		const dailyDex = await getDailyDex(dailyTime.getTime().toString());
		dailyDex.dailyTradeVolumeUSD = dailyDex.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dailyDex.tradeVolumeUSD = dex.tradeVolumeUSD;
		dailyDex.totalTVL = dex.totalTVL;
		dailyDex.timestamp = dailyTime;
		dailyDex.updateAtBlockId = blockData.id;
		await dailyDex.save();

		// update token data
		token0.amount = token0.amount + BigInt(token0Amount);
		token0.tvl = BigInt(newPrice0.times(FN.fromInner(token0.amount.toString(), token0.decimals)).toChainData());
		token0.tradeVolume = token0.tradeVolume + token0AmountAbs;
		token0.tradeVolumeUSD = token0.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData());
		token0.txCount = token0.txCount + BigInt(1);
		token0.price = BigInt(newPrice0.toChainData());
		token1.amount = token1.amount + BigInt(token1Amount);
		token1.tvl = BigInt(newPrice1.times(FN.fromInner(token1.amount.toString(), token1.decimals)).toChainData());
		token1.tradeVolume = token1.tradeVolume + token1AmountAbs;
		token1.tradeVolumeUSD = token1.tradeVolumeUSD + BigInt(token1ChangedUSD.toChainData());
		token1.txCount = token1.txCount + BigInt(1);
		token1.price = BigInt(newPrice1.toChainData());

		dailyToken0.tokenId = token0Name;
		dailyToken0.amount = token0.amount;
		dailyToken0.tvl = token0.tvl;
		dailyToken0.dailyTradeVolume = dailyToken0.dailyTradeVolume + token0AmountAbs;
		dailyToken0.dailyTradeVolumeUSD = dailyToken0.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData());
		dailyToken0.dailyTxCount = dailyToken0.dailyTxCount + BigInt(1);
		dailyToken0.timestamp = dailyTime;
		dailyToken0.updateAtBlockId = blockData.id;
		dailyToken1.tokenId = token1Name;
		dailyToken1.amount = token1.amount;
		dailyToken1.tvl = token1.tvl;
		dailyToken1.dailyTradeVolume = dailyToken1.dailyTradeVolume + token1AmountAbs;
		dailyToken1.dailyTradeVolumeUSD = dailyToken1.dailyTradeVolumeUSD + BigInt(token1ChangedUSD.toChainData())
		dailyToken1.dailyTxCount = dailyToken1.dailyTxCount + BigInt(1);
		dailyToken1.timestamp = dailyTime;
		dailyToken1.updateAtBlockId = blockData.id;

		await token0.save();
		await token1.save();
		await dailyToken0.save();
		await dailyToken1.save();

		await createSwapHistory(event, owner.toString(), poolId, token0Name, token1Name, oldPrice0, oldPrice1);
	}
};

const swapByRuntimeGt1008 = async (event: SubstrateEvent) => {
	// [trader, trading_path, supply_currency_amount, target_currency_amount\]
	const [who, tradingPath, resultPath] = event.event.data as unknown as [AccountId, CurrencyId[], Balance[]];
	const blockData = await ensureBlock(event);
	const hourTime = getStartOfHour(blockData.timestamp);
	const dailyTime = getStartOfDay(blockData.timestamp);

	for (let i = 0; i < tradingPath.length - 1; i++) {
		const currency0 = tradingPath[i];
		const currency1 = tradingPath[i + 1];
		const result0 = resultPath[i];
		const result1 = resultPath[i + 1];

		const supplyTokenName = forceToCurrencyName(currency0);
		// const targetTokenName = forceToCurrencyName(currency1);

		const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1);
		const token0 = await getToken(token0Name);
		const token1 = await getToken(token1Name);
		await getToken(poolId);
		const dailyToken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`);
		const dailyToken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`);
		const pool = await getPool(token0Name, token1Name, poolId);
		const dex = await getDex();

		const oldPrice0 = await queryPrice(token0.name);
		const oldPrice1 = await queryPrice(token1.name);

		const token0Amount = token0Name === supplyTokenName ? result0.toString() : "-" + result1.toString();
		const token1Amount = token1Name === supplyTokenName ? result0.toString() : "-" + result1.toString();

		const token0AmountAbs = BigInt(token0Amount) > 0 ? BigInt(token0Amount) : -BigInt(token0Amount);
		const token1AmountAbs = BigInt(token1Amount) > 1 ? BigInt(token1Amount) : -BigInt(token1Amount);
		const token0ChangedUSD = oldPrice0.times(FN.fromInner(token0AmountAbs.toString(), token0.decimals))
		const token1ChangedUSD = oldPrice1.times(FN.fromInner(token1AmountAbs.toString(), token1.decimals))
		token0ChangedUSD.setPrecision(18)
		token1ChangedUSD.setPrecision(18)

		const token0fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token0AmountAbs.toString(), token0.decimals)).toChainData());
		const token1fee = BigInt(FN.fromInner(pool.feeVolume.toString(), 18).times(FN.fromInner(token1AmountAbs.toString(), token1.decimals)).toChainData());
		const oldTotalTVL = pool.totalTVL;

		pool.token0Amount = pool.token0Amount + BigInt(token0Amount);
		pool.token1Amount = pool.token1Amount + BigInt(token1Amount);
		pool.token0Price = BigInt(oldPrice0.toChainData())
		pool.token1Price = BigInt(oldPrice1.toChainData())
		pool.feeToken0Amount = pool.feeToken0Amount + token0fee;
		pool.feeToken1Amount = pool.feeToken1Amount + token1fee;
		pool.token0TradeVolume = pool.token0TradeVolume + token0AmountAbs;
		pool.token1TradeVolume = pool.token1TradeVolume + token1AmountAbs;
		pool.tradeVolumeUSD = pool.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		pool.txCount = pool.txCount + BigInt(1);
		await pool.save();

		const newPrice0 = await queryPrice(token0Name);
		const newPrice1 = await queryPrice(token1Name);

		const newPool = await getPool(token0Name, token1Name, poolId);
		newPool.token0TVL = BigInt(newPrice0.times(FN.fromInner(newPool.token0Amount.toString(), token0.decimals)).toChainData());
		newPool.token1TVL = BigInt(newPrice1.times(FN.fromInner(newPool.token1Amount.toString(), token1.decimals)).toChainData());
		newPool.totalTVL = newPool.token0TVL + newPool.token1TVL;
		await newPool.save();

		const hourPoolId = `${poolId}-${hourTime.getTime()}`;
		const hourPool = await getHourlyPool(hourPoolId);
		hourPool.poolId = poolId;
		hourPool.timestamp = hourTime;
		hourPool.token0Id = token0Name;
		hourPool.token1Id = token1Name;
		hourPool.token0Amount = newPool.token0Amount;
		hourPool.token1Amount = newPool.token1Amount;
		hourPool.token0Price = BigInt(newPrice0.toChainData())
		hourPool.token1Price = BigInt(newPrice1.toChainData())
		hourPool.feeVolumeUSD = hourPool.feeVolumeUSD + token0fee + token1fee;
		hourPool.feeToken0Amount = hourPool.feeToken0Amount + token0fee;
		hourPool.feeToken1Amount = hourPool.feeToken1Amount + token1fee;
		hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + token0AmountAbs;
		hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + token1AmountAbs;
		hourPool.hourlyTradeVolumeUSD = hourPool.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		hourPool.token0TradeVolume = BigInt(token0Amount);
		hourPool.token1TradeVolume = BigInt(token1Amount);
		hourPool.token0TVL = newPool.token0TVL;
		hourPool.token1TVL = newPool.token1TVL;
		hourPool.txCount = hourPool.txCount + BigInt(1);
		hourPool.token0High = hourPool.token0High > BigInt(newPrice0.toChainData()) ? hourPool.token0High : BigInt(newPrice0.toChainData());
		hourPool.token0Low = hourPool.token0Low < BigInt(newPrice0.toChainData()) ? hourPool.token0Low : BigInt(newPrice0.toChainData());
		hourPool.token0Close = BigInt(newPrice0.toChainData());
		hourPool.token1High = hourPool.token1High > BigInt(newPrice1.toChainData()) ? hourPool.token1High : BigInt(newPrice1.toChainData());
		hourPool.token1Low = hourPool.token1Low < BigInt(newPrice1.toChainData()) ? hourPool.token1Low : BigInt(newPrice1.toChainData());
		hourPool.token1Close = BigInt(newPrice1.toChainData());
		hourPool.updateAtBlockId = blockData.id;
		await hourPool.save();

		const dailyPoolId = `${poolId}-${dailyTime.getTime()}`;
		const dailyPool = await getDailyPool(dailyPoolId);
		dailyPool.poolId = poolId;
		dailyPool.timestamp = dailyTime;
		dailyPool.token0Id = token0Name;
		dailyPool.token1Id = token1Name;
		dailyPool.token0Amount = newPool.token0Amount;
		dailyPool.token1Amount = newPool.token1Amount;
		dailyPool.token0Price = BigInt(newPrice0.toChainData())
		dailyPool.token1Price = BigInt(newPrice1.toChainData());
		dailyPool.feeVolumeUSD = dailyPool.feeVolumeUSD + token0fee + token1fee;
		dailyPool.feeToken0Amount = dailyPool.feeToken0Amount + token0fee;
		dailyPool.feeToken1Amount = dailyPool.feeToken1Amount + token1fee;
		dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + token0AmountAbs;
		dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + token1AmountAbs;
		dailyPool.dailyTradeVolumeUSD = dailyPool.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dailyPool.token0TradeVolume = BigInt(token0Amount);
		dailyPool.token1TradeVolume = BigInt(token1Amount);
		dailyPool.token0TVL = newPool.token0TVL;
		dailyPool.token1TVL = newPool.token1TVL;
		dailyPool.totalTVL = dailyPool.token0TVL + dailyPool.token1TVL
		dailyPool.txCount = dailyPool.txCount + BigInt(1);
		dailyPool.token0High = dailyPool.token0High > BigInt(newPrice0.toChainData()) ? dailyPool.token0High : BigInt(newPrice0.toChainData());
		dailyPool.token0Low = dailyPool.token0Low < BigInt(newPrice0.toChainData()) ? dailyPool.token0Low : BigInt(newPrice0.toChainData());
		dailyPool.token0Close = BigInt(newPrice0.toChainData());
		dailyPool.token1High = dailyPool.token1High > BigInt(newPrice1.toChainData()) ? dailyPool.token1High : BigInt(newPrice1.toChainData());
		dailyPool.token1Low = dailyPool.token1Low < BigInt(newPrice1.toChainData()) ? dailyPool.token1Low : BigInt(newPrice1.toChainData());
		dailyPool.token1Close = BigInt(newPrice1.toChainData());
		dailyPool.updateAtBlockId = blockData.id;
		await dailyPool.save();

		dex.tradeVolumeUSD = dex.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dex.totalTVL = dex.totalTVL + newPool.totalTVL - oldTotalTVL;
		await dex.save();

		const hourDex = await getHourDex(hourTime.getTime().toString());
		hourDex.hourlyTradeVolumeUSD = hourDex.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		hourDex.tradeVolumeUSD = dex.tradeVolumeUSD;
		hourDex.totalTVL = dex.totalTVL;
		hourDex.timestamp = hourTime;
		hourDex.updateAtBlockId = blockData.id;
		await hourDex.save();

		const dailyDex = await getDailyDex(dailyTime.getTime().toString());
		dailyDex.dailyTradeVolumeUSD = dailyDex.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		dailyDex.tradeVolumeUSD = dex.tradeVolumeUSD;
		dailyDex.totalTVL = dex.totalTVL;
		dailyDex.timestamp = dailyTime;
		dailyDex.updateAtBlockId = blockData.id;
		await dailyDex.save();

		// update token data
		token0.amount = token0.amount + BigInt(token0Amount);
		token0.tvl = BigInt(newPrice0.times(FN.fromInner(token0.amount.toString(), token0.decimals)).toChainData());
		token0.tradeVolume = token0.tradeVolume + token0AmountAbs;
		token0.tradeVolumeUSD = token0.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
		token0.txCount = token0.txCount + BigInt(1);
		token0.price = BigInt(newPrice0.toChainData());
		token1.amount = token1.amount + BigInt(token1Amount);
		token1.tvl = BigInt(newPrice1.times(FN.fromInner(token1.amount.toString(), token1.decimals)).toChainData());
		token1.tradeVolume = token1.tradeVolume + token1AmountAbs;
		token1.tradeVolumeUSD = token1.tradeVolumeUSD + BigInt(token1ChangedUSD.toChainData());
		token1.txCount = token1.txCount + BigInt(1);
		token1.price = BigInt(newPrice1.toChainData());

		dailyToken0.tokenId = token0Name;
		dailyToken0.amount = token0.amount;
		dailyToken0.tvl = token0.tvl;
		dailyToken0.dailyTradeVolume = dailyToken0.dailyTradeVolume + token0AmountAbs;
		dailyToken0.dailyTradeVolumeUSD = dailyToken0.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData());
		dailyToken0.dailyTxCount = dailyToken0.dailyTxCount + BigInt(1);
		dailyToken0.timestamp = dailyTime;
		dailyToken0.updateAtBlockId = blockData.id;
		dailyToken1.tokenId = token1Name;
		dailyToken1.amount = token1.amount;
		dailyToken1.tvl = token1.tvl;
		dailyToken1.dailyTradeVolume = dailyToken1.dailyTradeVolume + token1AmountAbs;
		dailyToken1.dailyTradeVolumeUSD = dailyToken1.dailyTradeVolumeUSD + BigInt(token1ChangedUSD.toChainData());
		dailyToken1.dailyTxCount = dailyToken1.dailyTxCount + BigInt(1);
		dailyToken1.timestamp = dailyTime;
		dailyToken1.updateAtBlockId = blockData.id;

		await token0.save();
		await token1.save();
		await dailyToken0.save();
		await dailyToken1.save();

		await createSwapHistory(event, who.toString(), poolId, token0Name, token1Name, oldPrice0, oldPrice1);
	}
};

const createSwapHistory = async (event: SubstrateEvent, owner: string, poolId: string, token0Name: string, token1Name: string, price0: FN, price1: FN) => {
	let who: AccountId;
	let supplyAmount: Balance
	let targetAmount: Balance
	let tradingPath: CurrencyId[];
	if (event.event.data.length === 3) {
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
	await getAccount(owner);

	const historyId = `${blockData.id}-${event.event.index.toString()}`;
	const history = await getSwap(historyId);

	history.addressId = owner;
	history.poolId = poolId;
	history.token0Id = token0Name;
	history.token1Id = token1Name;
	history.token0InAmount = BigInt(supplyAmount.toString());
	history.token1OutAmount = BigInt(targetAmount.toString());
	history.tradePath = tradingPath.map(token => forceToCurrencyName(token)).join(',');
	history.price0 = BigInt(price0.toChainData())
	history.price1 = BigInt(price1.toChainData())
	history.timestamp = blockData.timestamp;
	history.blockId = blockData.id;

	if (event.extrinsic) {
		const extrinsicData = await ensureExtrinsic(event);
		history.extrinsicId = extrinsicData.id;
		await getAccount(event.extrinsic.extrinsic.signer.toString());

		extrinsicData.section = event.event.section;
		extrinsicData.method = event.event.method;
		extrinsicData.addressId = event.extrinsic.extrinsic.signer.toString();

		await extrinsicData.save();
	}
	await history.save();
};