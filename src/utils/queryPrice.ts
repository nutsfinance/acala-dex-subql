import { FixedPointNumber as FN, forceToCurrencyName, MaybeCurrency, Token } from "@acala-network/sdk-core";
import { SubstrateEvent } from "@subql/types";
import { getPool, getPriceBundle, getToken } from ".";
import { ensureBlock } from "../handlers";
import { Pool } from "../types";

interface PoolProps {
	tokenTvl: FN;
	price: FN;
}

const getAllRelatedPools = async (token: string) => {
	const pools0 = await Pool.getByToken0Id(token);
	const pools1 = await Pool.getByToken1Id(token);

	const pools: PoolProps[] = [];
	const totalTvl = FN.ZERO;
	let price = FN.ZERO;

	[...pools0, ...pools1].forEach(async pool => {
		const token0 = await getToken(pool.token0Id);
		const token1 = await getToken(pool.token1Id);
		const amount0 = FN.fromInner(pool.token0Amount.toString() || "0", token0.decimals);
		const amount1 = FN.fromInner(pool.token1Amount.toString() || "0", token1.decimals);
		const price = amount0.isZero() || amount1.isZero() ? FN.ZERO : (pool.token0Id === token ? amount1.div(amount0) : amount0.div(amount1))
		price.setPrecision(18);
		totalTvl.add(FN.fromInner(pool.totalTVL.toString(), 18));
		pools.push({
			tokenTvl: FN.fromInner(pool.token0Id === token ? pool.token0TVL.toString() : pool.token1TVL.toString(), 18),
			price: price,
		})
	});

	pools.forEach(item => {
		price = price.add(item.price.times(item.tokenTvl).div(totalTvl));
	});

	return price;
}

async function getPriceFromDexPool(tokenA: string, tokenB: string) {
	const [_t0, _t1] = Token.sortTokenNames(tokenA, tokenB);
	const token0 = await getToken(_t0);
	const token1 = await getToken(_t1);
	const pool = await getPool(tokenA, tokenB);

	if (pool.txCount == BigInt(0)) return FN.ZERO;

	const amount0 = FN.fromInner(pool.token0Amount.toString() || "0", token0.decimals);
	const amount1 = FN.fromInner(pool.token1Amount.toString() || "0", token1.decimals);

	if (amount0.isZero()) return FN.ZERO;

	return pool.token0Id === tokenA ? amount1.div(amount0) : amount0.div(amount1);
}
// get KAR price from KSM-KAR pair
export async function getKARPrice() {
	// get KAR-KSM pool
	const karKSMPrice = await getPriceFromDexPool("KAR", "KSM");
	const ksmPrice = await getKSMPrice();

	return karKSMPrice.mul(ksmPrice);
}

export async function getLKSMPrice() {
	// get KSM-LKSM pool
	const lksmKSMPrice = await getPriceFromDexPool("LKSM", "KSM");
	const ksmPrice = await getKSMPrice();

	return lksmKSMPrice.mul(ksmPrice);
}

export async function getKSMPrice() {
	return getPriceFromDexPool("KSM", "KUSD");
}

// get KUSD price as $1
export function getKUSDPrice() {
	return new FN(1, 12);
}

export async function getDOTPrice() {
	// get ACA-LC://13 pool
	const dotLCPrice = await getPriceFromDexPool("DOT", "lc://13");
	const lc13Price = await getLC13Price();

	return dotLCPrice.mul(lc13Price);
}

export async function getACAPrice() {
	// get ACA-LC://13 pool
	const acaLCPrice = await getPriceFromDexPool("ACA", "lc://13");
	const lc13Price = await getLC13Price();

	return acaLCPrice.mul(lc13Price);
}

export async function getLC13Price() {
	return getPriceFromDexPool("lc://13", "AUSD");
}

export async function circulatePrice(name: MaybeCurrency) {
	const _name = forceToCurrencyName(name);

	if (_name === "KUSD" || _name === "AUSD") return getKUSDPrice();

	if (_name === "KSM") return getKSMPrice();

	if (_name === "KAR") return getKARPrice();

	if (_name === "LKSM") return getLKSMPrice();

	if (_name === "DOT") return getDOTPrice();

	if (_name === "ACA") return getACAPrice();

	if (_name === "lc://13") return getLC13Price();

	return getPriceFromDexPool(_name, "KUSD");
}


export const queryPrice = async (event: SubstrateEvent, token: string) => {
	const { id: blockId, number } = await ensureBlock(event);
	const id = `${number}-${token}`;
	const { isExist, record } = await getPriceBundle(id);
	if (isExist) return FN.fromInner(record.price.toString(), 18);
	else {
		const price = await circulatePrice(token);
		price.setPrecision(18);
		record.blockId = blockId;
		record.TokenId = token;
		record.price = BigInt(price.toChainData());

		await record.save();
		return price;
	}
};
