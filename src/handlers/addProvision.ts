import { FixedPointNumber as FN } from "@acala-network/sdk-core"
import { AccountId, Balance, CurrencyId } from "@acala-network/types/interfaces"
import { SubstrateEvent } from "@subql/types"
import { ensureBlock, ensureExtrinsic } from "."
import { getAddProvision, getDateStartOfDay, getDateStartOfHour, getProvisionPool, getProvisionPoolHourlyData, getToken, getTokenDailyData, getUserProvision, queryPrice } from "../utils"
import { getPoolId } from "../utils/getPoolId"

export const addProvision = async (event: SubstrateEvent) => {
  // [who, currency_id_0, contribution_0, currency_id_1, contribution_1]
  const [account, _token0, _token0Amount, _token1, _token1Amount] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
  const [poolId, token0Name, token1Name] = getPoolId(_token0, _token1);
  const blockData = await ensureBlock(event);
  const dailyTime = getDateStartOfDay(blockData.timestamp).toDate();
  const hourTime = getDateStartOfHour(blockData.timestamp).toDate();

  const price0 = await queryPrice(event, token0Name);
  const price1 = await queryPrice(event, token1Name);

  const token0Amount = BigInt(_token0Amount.toString());
  const token1Amount = BigInt(_token1Amount.toString());

  const provisionPool = await getProvisionPool(poolId);
  provisionPool.token0Amount = provisionPool.token0Amount + token0Amount;
  provisionPool.token1Amount = provisionPool.token1Amount + token1Amount;
  provisionPool.txCount = provisionPool.txCount + BigInt(1);

  await updateToken(poolId, token0Name, token1Name, token0Amount, token1Amount, price0, price1);
  await updateDailyToken(dailyTime, poolId, token0Name, token1Name, token0Amount, token1Amount, price0, price1);
  await provisionPool.save();
  await addHourProvisionPool(hourTime, poolId, token0Name, token1Name, token0Amount, token1Amount, BigInt(price0.toChainData()), BigInt(price1.toChainData()));
  await addUserProvision(event);
  await createAddProvisionHistory(event, account.toString(), poolId, token0Name, token1Name, token0Amount, token1Amount, BigInt(price0.toChainData()), BigInt(price1.toChainData()));
}

export const updateToken = async (poolId: string, token0Name: string, token1Name: string, token0Amount: bigint, token1Amount: bigint, price0: FN, price1: FN) => {
  const poolToken = await getToken(poolId);
  const token0 = await getToken(token0Name);
  const token1 = await getToken(token1Name);

  poolToken.txCount = poolToken.txCount + BigInt(1);
  token0.txCount = token0.txCount + BigInt(1);
  token1.txCount = token1.txCount + BigInt(1);

  poolToken.amount = poolToken.amount + token0Amount + token1Amount
  token0.amount = token0.amount + token0Amount
  token1.amount = token1.amount + token1Amount

  const token0Value = BigInt(new FN(token0.amount.toString()).times(price0).toChainData());
  const token1Value = BigInt(new FN(token1.amount.toString()).times(price1).toChainData());

  poolToken.tvl = token0Value + token1Value;
  token0.tvl = token0Value;
  token1.tvl = token1Value;

  await poolToken.save();
  await token0.save();
  await token1.save();
}

export const updateDailyToken = async (dailyTime:Date, poolId: string, token0Name: string, token1Name: string, token0Amount: bigint, token1Amount: bigint, price0: FN, price1: FN) => {
  const dailyToken0 = await getTokenDailyData(`${token0Name}-${dailyTime.getTime()}`)
  const dailyToken1 = await getTokenDailyData(`${token1Name}-${dailyTime.getTime()}`)
  const dailyPoolToken = await getTokenDailyData(`${poolId}-${dailyTime.getTime()}`)

  dailyPoolToken.dailyTxCount = dailyPoolToken.dailyTxCount + BigInt(1);
  dailyToken0.dailyTxCount = dailyToken0.dailyTxCount + BigInt(1);
  dailyToken1.dailyTxCount = dailyToken1.dailyTxCount + BigInt(1);

  dailyPoolToken.amount = dailyPoolToken.amount + token0Amount + token1Amount
  dailyToken0.amount = dailyToken0.amount + token0Amount
  dailyToken1.amount = dailyToken1.amount + token1Amount

  const dailyToken0Value = BigInt(new FN(dailyToken0.amount.toString()).times(price0).toChainData());
  const dailyToken1Value = BigInt(new FN(dailyToken1.amount.toString()).times(price1).toChainData());

  dailyPoolToken.tvl = dailyToken0Value + dailyToken1Value;
  dailyToken0.tvl = dailyToken0Value;
  dailyToken1.tvl = dailyToken1Value;

  await dailyToken0.save();
  await dailyToken1.save();
  await dailyPoolToken.save();
}

export const addHourProvisionPool = async (hourTime: Date, poolId: string, token0: string, token1: string, token0Amount: bigint, token1Amount: bigint, price0: bigint, price1: bigint) => {
  const hourPoolId = `${token0}-${token1}-${hourTime.getTime()}`
  const hourProvisionPool = await getProvisionPoolHourlyData(hourPoolId);
  hourProvisionPool.poolId = poolId;
  hourProvisionPool.token0Amount = token0Amount;
  hourProvisionPool.token1Amount = token1Amount;
  hourProvisionPool.price0 = price0;
  hourProvisionPool.price1 = price1;
  hourProvisionPool.hourlyToken0InAmount = hourProvisionPool.hourlyToken0InAmount + token0Amount;
  hourProvisionPool.hourlyToken1InAmount = hourProvisionPool.hourlyToken1InAmount + token1Amount;
  hourProvisionPool.timestamp = hourTime;

  await hourProvisionPool.save();
}

export const addUserProvision = async (event) => {
  const [account, _token0, token0Amount, _token1, token1Amount] = event.event.data as unknown as [AccountId, CurrencyId, Balance, CurrencyId, Balance];
  const [poolId, token0Name, token1Name] = getPoolId(_token0, _token1);
  const userPoolId = `${token0Name}-${token1Name}-${account.toString()}`;
  const userPool = await getUserProvision(userPoolId);
  userPool.ownerId = account.toString()
  userPool.poolId = poolId;
  userPool.token0Amount = BigInt(token0Amount.toString());
  userPool.token1Amount = BigInt(token1Amount.toString());

  await userPool.save();
}

export const createAddProvisionHistory = async (event: SubstrateEvent, addressId: string, poolId: string, token0: string, token1: string, token0Amount: bigint, token1Amount: bigint, price0: bigint, price1: bigint) => {
  const blockData = await ensureBlock(event);
  const extrinsicData = await ensureExtrinsic(event);
  const historyId = `${blockData.hash}-${event.event.index.toString()}`;
  const history = await getAddProvision(historyId);
  history.addressId = addressId;
  history.poolId = poolId;
  history.token0Id = token0;
  history.token1Id = token1;
  history.token0Amount = token0Amount;
  history.token1Amount = token1Amount;
  history.price0 = price0;
  history.price1 = price1;
  history.blockId = blockData.id;
  history.extrinsicId = extrinsicData.id;
  history.timestamp = blockData.timestamp;

  await history.save();
}