import { FixedPointNumber as FN } from "@acala-network/sdk-core";
import { Balance, TradingPair } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import { ensureBlock, ensureExtrinsic } from ".";
import { getProvisionPool, getProvisionToEnabled, getToken, queryPrice } from "../utils";
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

export const createDexPool = async (event: SubstrateEvent) => {
  // [trading_pair, pool_0_amount, pool_1_amount, total_share_amount\]
  const [tradingPair, token0Amount, token1Amount, totalShareAmount] = event.event.data as unknown as [TradingPair, Balance, Balance, Balance]
  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1]);

  
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