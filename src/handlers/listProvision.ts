import { TradingPair } from "@acala-network/types/interfaces";
import { SubstrateEvent } from "@subql/types";
import { ensureBlock, ensureExtrinsic } from ".";
import { getToken, getProvisionPool, getListProvision } from "../utils";
import { getPoolId } from "../utils/getPoolId";

export const listProvision = async (event: SubstrateEvent) => {
  // [trading_pair]
  const [tradingPair] = event.event.data as unknown as [TradingPair]
  const blockData = await ensureBlock(event);

  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1])

  const poolToken = await getToken(poolId)
  const token0 = await getToken(token0Id)
  const token1 = await getToken(token1Id)

  poolToken.poolCount = poolToken.poolCount + 1;
  token0.poolCount = token0.poolCount + 1;
  token1.poolCount = token1.poolCount + 1;

  const provisionPool = await getProvisionPool(poolId)
  provisionPool.token0Id = token0.name;
  provisionPool.token1Id = token1.name;
  provisionPool.startAtBlockId = blockData.hash
  provisionPool.startAt = blockData.timestamp;

  await poolToken.save();
  await token0.save();
  await token1.save();
  await provisionPool.save();
}

export const createlistProvisionHistroy = async (event: SubstrateEvent) => {
  const [tradingPair] = event.event.data as unknown as [TradingPair]
  const blockData = await ensureBlock(event);
  const extrinsicData = await ensureExtrinsic(event);

  const [poolId, token0Id, token1Id] = getPoolId(tradingPair[0], tradingPair[1])
  const history  = await getListProvision(poolId);
  history.poolId = poolId;
  history.token0Id = token0Id;
  history.token1Id = token1Id;
  history.blockId = blockData.id;
  history.extrinsicId = extrinsicData.id;

  await history.save();
}