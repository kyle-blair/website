export type CounterAdjustment = -1 | 1;

export interface CounterStore {
	read(name: string): Promise<number>;
	adjust(
		name: string,
		operationId: string,
		amount: CounterAdjustment,
	): Promise<number>;
}
