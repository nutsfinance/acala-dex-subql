import { forceToCurrencyName, FixedPointNumber as FN } from "@acala-network/sdk-core";
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import { ensureBlock, ensureExtrinsic } from ".";
import { getAccount, getAddLiquidity, getDailyDex, getDailyPool, getDex, getHourDex, getHourlyPool, getPool, getStartOfDay, getStartOfHour, getToken, getTokenDailyData, queryPrice } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const removeLiquidity = async (event: SubstrateEvent) => {
	// [who, currency_id_0, pool_0_decrement, currency_id_1, pool_1_decrement, share_decrement\]
	const [_, currency0, pool0Decrement, currency1, pool1Decrement] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
	const blockData = await ensureBlock(event);

	const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1);
	const token0Decrement = (token0Name === forceToCurrencyName(currency0) ? pool0Decrement : pool1Decrement).toString();
	const token1Decrement = (token1Name === forceToCurrencyName(currency0) ? pool0Decrement : pool1Decrement).toString();
	const price0 = await queryPrice(event, token0Name);
	const price1 = await queryPrice(event, token1Name);
	const hourTime = getStartOfHour(blockData.timestamp);
	const dailyTime = getStartOfDay(blockData.timestamp);

	const { token0, token1 } = await updateToken(event, poolId, token0Name, token1Name, token0Decrement, token1Decrement, price0, price1);

	const pool = await getPool(token0Name, token1Name, poolId);
	const oldTotalTVL = pool.totalTVL;

	const token0ChangedUSD = price0.times(FN.fromInner(token0Decrement, token0.decimals));
	const token1ChangedUSD = price1.times(FN.fromInner(token1Decrement, token1.decimals));

	pool.token0Amount = pool.token0Amount - BigInt(token0Decrement);
	pool.token1Amount = pool.token1Amount - BigInt(token1Decrement);
	pool.token0Price = BigInt(price0.toChainData());
	pool.token1Price = BigInt(price1.toChainData());
	pool.token0TradeVolume = pool.token0TradeVolume + BigInt(token0Decrement);
	pool.token1TradeVolume = pool.token1TradeVolume + BigInt(token1Decrement);
	pool.tradeVolumeUSD = pool.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
	pool.token0TVL = BigInt(price0.times(FN.fromInner(pool.token0Amount.toString())).toChainData());
	pool.token1TVL = BigInt(price1.times(FN.fromInner(pool.token1Amount.toString())).toChainData());
	pool.totalTVL = pool.token0TVL + pool.token1TVL;
	pool.txCount = pool.txCount + BigInt(1);
	await pool.save();

	const hourPoolId = `${poolId}-${hourTime.getTime()}`;
	const hourPool = await getHourlyPool(hourPoolId);
	hourPool.poolId = poolId;
	hourPool.timestamp = hourTime;
	hourPool.token0Id = token0Name;
	hourPool.token1Id = token1Name;
	hourPool.token0Amount = pool.token0Amount;
	hourPool.token1Amount = pool.token1Amount;
	hourPool.token0Price = BigInt(price0.toChainData());
	hourPool.token1Price = BigInt(price1.toChainData());
	hourPool.hourlyToken0TradeVolume = hourPool.hourlyToken0TradeVolume + BigInt(token0Decrement);
	hourPool.hourlyToken1TradeVolume = hourPool.hourlyToken1TradeVolume + BigInt(token1Decrement);
	hourPool.hourlyTradeVolumeUSD = hourPool.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
	hourPool.token0TradeVolume = BigInt(token0Decrement);
	hourPool.token1TradeVolume = BigInt(token1Decrement);
	hourPool.token0TVL = pool.token0TVL;
	hourPool.token1TVL = pool.token1TVL;
	hourPool.txCount = hourPool.txCount + BigInt(1);
	hourPool.token0High = hourPool.token0High > BigInt(price0.toChainData()) ? hourPool.token0High : BigInt(price0.toChainData());
	hourPool.token0Low = hourPool.token0Low < BigInt(price0.toChainData()) ? hourPool.token0Low : BigInt(price0.toChainData());
	hourPool.token1High = hourPool.token1High > BigInt(price1.toChainData()) ? hourPool.token1High : BigInt(price1.toChainData());
	hourPool.token1Low = hourPool.token1Low < BigInt(price1.toChainData()) ? hourPool.token1Low : BigInt(price1.toChainData());
	hourPool.token0Close = BigInt(price0.toChainData());
	hourPool.token1Close = BigInt(price1.toChainData());
	hourPool.updateAtBlockId = blockData.hash;
	await hourPool.save();

	const dailyPoolId = `${poolId}-${dailyTime.getTime()}`;
	const dailyPool = await getDailyPool(dailyPoolId);
	dailyPool.poolId = poolId;
	dailyPool.timestamp = dailyTime;
	dailyPool.token0Id = token0Name;
	dailyPool.token1Id = token1Name;
	dailyPool.token0Amount = pool.token0Amount;
	dailyPool.token1Amount = pool.token1Amount;
	dailyPool.token0Price = BigInt(price0.toChainData());
	dailyPool.token1Price = BigInt(price1.toChainData());
	dailyPool.dailyToken0TradeVolume = dailyPool.dailyToken0TradeVolume + BigInt(token0Decrement);
	dailyPool.dailyToken1TradeVolume = dailyPool.dailyToken1TradeVolume + BigInt(token1Decrement);
	dailyPool.dailyTradeVolumeUSD = dailyPool.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());
	dailyPool.token0TradeVolume = BigInt(token0Decrement);
	dailyPool.token1TradeVolume = BigInt(token1Decrement);
	dailyPool.token0TVL = pool.token0TVL;
	dailyPool.token1TVL = pool.token1TVL;
	dailyPool.txCount = dailyPool.txCount + BigInt(1);
	dailyPool.token0High = dailyPool.token0High > BigInt(price0.toChainData()) ? dailyPool.token0High : BigInt(price0.toChainData());
	dailyPool.token0Low = dailyPool.token0Low < BigInt(price0.toChainData()) ? dailyPool.token0Low : BigInt(price0.toChainData());
	dailyPool.token1High = dailyPool.token1High > BigInt(price1.toChainData()) ? dailyPool.token1High : BigInt(price1.toChainData());
	dailyPool.token1Low = dailyPool.token1Low < BigInt(price1.toChainData()) ? dailyPool.token1Low : BigInt(price1.toChainData());
	dailyPool.token0Close = BigInt(price0.toChainData());
	dailyPool.token1Close = BigInt(price1.toChainData());
	dailyPool.updateAtBlockId = blockData.hash;
	await dailyPool.save();

	const dex = await getDex("dex");
	dex.tradeVolumeUSD = dex.tradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());;
	dex.totalTVL = dex.totalTVL + pool.totalTVL - oldTotalTVL;
	await dex.save();

	const hourDex = await getHourDex(hourTime.getTime().toString());
	hourDex.hourlyTradeVolumeUSD = hourDex.hourlyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());;
	hourDex.tradeVolumeUSD = dex.tradeVolumeUSD;
	hourDex.totalTVL = dex.totalTVL;
	hourDex.timestamp = hourTime;
	hourDex.updateAtBlockId = blockData.hash;
	await hourDex.save();

	const dailyDex = await getDailyDex(dailyTime.getTime().toString());
	dailyDex.dailyTradeVolumeUSD = dailyDex.dailyTradeVolumeUSD + BigInt(token0ChangedUSD.toChainData()) + BigInt(token1ChangedUSD.toChainData());;
	dailyDex.tradeVolumeUSD = dex.tradeVolumeUSD;
	dailyDex.totalTVL = dex.totalTVL;
	dailyDex.timestamp = dailyTime;
	dailyDex.updateAtBlockId = blockData.hash;
	await dailyDex.save();

	await createRemoveLiquidyHistory(event, price0, price1);
};

const updateToken = async (event: SubstrateEvent, poolId: string, token0Name: string, token1Name: string, token0Decrement: string, token1Decrement: string, price0: FN, price1: FN) => {
	const token0 = await getToken(token0Name);
	const token1 = await getToken(token1Name);

	const token0Changed = BigInt(token0Decrement) > 0 ? BigInt(token0Decrement) : -BigInt(token0Decrement)
	const token1Changed = BigInt(token1Decrement) > 0 ? BigInt(token1Decrement) : -BigInt(token1Decrement)
	const token0ChangedUSD = BigInt(price0.times(FN.fromInner(token0Changed.toString(), token0.decimals)).toChainData());
	const token1ChangedUSD = BigInt(price1.times(FN.fromInner(token1Changed.toString(), token1.decimals)).toChainData());

	token0.amount = token0.amount - BigInt(token0Changed);
	token0.tvl = BigInt(price0.times(FN.fromInner(token0.amount.toString(), token0.decimals)).toChainData());
	token0.tradeVolume = token0.tradeVolume + token0Changed;
	token0.tradeVolumeUSD = token0.tradeVolumeUSD + token0ChangedUSD
	token0.txCount = token0.txCount + BigInt(1);
	token1.amount = token1.amount - BigInt(token1Changed);
	token1.tvl = BigInt(price1.times(FN.fromInner(token1.amount.toString(), token1.decimals)).toChainData());
	token1.tradeVolume = token1.tradeVolume + token1Changed
	token1.tradeVolumeUSD = token1.tradeVolumeUSD + token1ChangedUSD;
	token1.txCount = token1.txCount + BigInt(1);

	const dailyTime = getStartOfDay(event.block.timestamp);
	const Dailytoken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`);
	const Dailytoken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`);

	Dailytoken0.tokenId = token0Name;
	Dailytoken0.amount = token0.amount;
	Dailytoken0.tvl = token0.tvl;
	Dailytoken0.dailyTradeVolume = Dailytoken0.dailyTradeVolume + token0Changed;
	Dailytoken0.dailyTradeVolumeUSD = Dailytoken0.dailyTradeVolumeUSD + token0ChangedUSD;
	Dailytoken0.dailyTxCount = Dailytoken0.dailyTxCount + BigInt(1);
	Dailytoken0.timestamp = dailyTime;
	Dailytoken0.updateAtBlockId = event.block.block.hash.toString();
	Dailytoken1.tokenId = token1Name;
	Dailytoken1.amount = token1.amount;
	Dailytoken1.tvl = token1.tvl;
	Dailytoken1.dailyTradeVolume = Dailytoken1.dailyTradeVolume + token1Changed;
	Dailytoken1.dailyTradeVolumeUSD = Dailytoken1.dailyTradeVolumeUSD + token1ChangedUSD;
	Dailytoken1.dailyTxCount = Dailytoken1.dailyTxCount + BigInt(1);
	Dailytoken1.timestamp = dailyTime;
	Dailytoken1.updateAtBlockId = event.block.block.hash.toString();

	await token0.save();
	await token1.save();
	await Dailytoken0.save();
	await Dailytoken1.save();

	return { token0, token1 };
};

export const createRemoveLiquidyHistory = async (event: SubstrateEvent, price0: FN, price1: FN) => {
	// [who, currency_id_0, pool_0_increment, currency_id_1, pool_1_increment, share_increment\]
	const [owner, currency0, pool0Decrement, currency1, pool1Decrement] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
	const blockData = await ensureBlock(event);
	const extrinsicData = await ensureExtrinsic(event);

	const [poolId, token0Name, token1Name] = getPoolId(currency0, currency1);
	const token0Decrement = (token0Name === forceToCurrencyName(currency0) ? pool0Decrement : pool1Decrement).toString();
	const token1Decrement = (token1Name === forceToCurrencyName(currency0) ? pool0Decrement : pool1Decrement).toString();

	const historyId = `${blockData.hash}-${event.event.index.toString()}`;
	const history = await getAddLiquidity(historyId);
	history.addressId = owner.toString();
	history.poolId = poolId;
	history.token0Id = token0Name;
	history.token1Id = token1Name;
	history.token0Amount = BigInt(token0Decrement.toString());
	history.token1Amount = BigInt(token1Decrement.toString());
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
};