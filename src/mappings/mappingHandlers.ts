import { SubstrateEvent } from "@subql/types";
import { addProvision, listProvision } from "../handlers";
import { createDexPool, createProvisionToEnableHistory, provisionToEnable } from "../handlers";

export const handleProvisioningToEnabled = async (event: SubstrateEvent) => {
  await provisionToEnable(event);
  await createDexPool(event);
  await createProvisionToEnableHistory(event);
};

export const handleAddLiquidity = async (event: SubstrateEvent) => {

};

export const handleRemoveLiquidity = async (event: SubstrateEvent) => {

};

export const handleSwap = async (event: SubstrateEvent) => {

};

export const handleListProvision = async (event: SubstrateEvent) => {
  await listProvision(event);
};

export const handleAddProvision = async (event: SubstrateEvent) => {
  await addProvision(event);
};
