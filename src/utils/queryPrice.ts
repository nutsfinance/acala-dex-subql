import { FixedPointNumber as FN, forceToCurrencyName, MaybeCurrency, Token } from "@acala-network/sdk-core";
import { getPool, getToken } from ".";

const getOtherPrice = async (token: string, stakingCurrency: string, StableCurrency: string) => {
	const {rate: rateA, amount: _amountA} = await getPriceFromDexPool(token, stakingCurrency);
	const {rate: rateB, amount: _amountB} = await getPriceFromDexPool(token,StableCurrency);

	if(rateA.isZero() || rateB.isZero()) return FN.ZERO;

	const amountA = FN.fromInner(_amountA.toString(), 18);
	const amountB = FN.fromInner(_amountB.toString(), 18);
	const StakingPrice = await getStakingCurrencyPrice(stakingCurrency, stakingCurrency);
	const StablePrice = await getStableCurrencyPrice();

	const partA = rateA.mul(StakingPrice).times(amountA).div(amountA.add(amountB));
	const partB = rateB.mul(StablePrice).times(amountB).div(amountA.add(amountB));

	return partA.add(partB);
}

const getPriceFromDexPool = async (tokenA: string, tokenB: string) => {
	const [_t0, _t1] = Token.sortTokenNames(tokenA, tokenB);
	const token0 = await getToken(_t0);
	const token1 = await getToken(_t1);
	const pool = await getPool(tokenA, tokenB);

	if (!pool || pool.txCount == BigInt(0)) return {
		rate: FN.ZERO,
		amount: BigInt(1)
	};

	const amount0 = FN.fromInner(pool.token0Amount.toString() || "0", token0.decimals);
	const amount1 = FN.fromInner(pool.token1Amount.toString() || "0", token1.decimals);

	if (amount0.isZero() || amount1.isZero()) return {
		rate: FN.ZERO,
		amount: BigInt(1)
	};

	return {
		rate: pool.token0Id === tokenA ? amount1.div(amount0) : amount0.div(amount1),
		amount: pool.token0Amount + pool.token1Amount
	}
}

const	getStableCurrencyPrice = () => {
	return new FN(1, 18);
}

const getStakingCurrencyPrice = async (stakingCurrency: string, StableCurrency: string) => {
	const result = await getPriceFromDexPool(stakingCurrency, StableCurrency);
	return result.rate;
}

export const circulatePrice = async (name: MaybeCurrency) => {
	const _name = forceToCurrencyName(name);

	const stakingCurrency = api.consts.prices.getStakingCurrencyId;
	const StableCurrency = api.consts.prices.getStableCurrencyId;
	const stakingCurrencyName = forceToCurrencyName(stakingCurrency);
	const StableCurrencyName = forceToCurrencyName(StableCurrency);

	if (_name === "KUSD" || _name === "AUSD") return getStableCurrencyPrice();

	else if(_name === 'KSM' || _name === 'DOT') return getStakingCurrencyPrice(stakingCurrencyName, StableCurrencyName);

	else return getOtherPrice(_name, stakingCurrencyName, StableCurrencyName);
}

export const queryPrice = async (token: string) => {
	const price = await circulatePrice(token);
	price.setPrecision(18);

	const tokenData = await getToken(token);
	tokenData.price = BigInt(price.toChainData());

	await tokenData.save();
	return price
};
