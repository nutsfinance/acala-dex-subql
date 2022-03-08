import { SubstrateEvent } from "@subql/types";
import { addLiquidity, addProvision, listProvision, removeLiquidity, swap } from "../handlers";
import { createPool, createProvisionToEnableHistory, provisionToEnable } from "../handlers";

export const handleProvisioningToEnabled = async (event: SubstrateEvent) => {
  logger.info('handleProvisioningToEnabled');
  await provisionToEnable(event);
  await createPool(event);
  await createProvisionToEnableHistory(event);
};

export const handleAddLiquidity = async (event: SubstrateEvent) => {
  logger.info('handleAddLiquidity');
  await addLiquidity(event);
};

export const handleRemoveLiquidity = async (event: SubstrateEvent) => {
  logger.info('handleRemoveLiquidity');
 await removeLiquidity(event);
};

export const handleSwap = async (event: SubstrateEvent) => {
  logger.info('handleSwap');
 await swap(event);
};

export const handleListProvision = async (event: SubstrateEvent) => {
  logger.info('handleListProvision');
  await listProvision(event);
};

export const handleAddProvision = async (event: SubstrateEvent) => {
  logger.info('handleAddProvision');
  await addProvision(event);
};
