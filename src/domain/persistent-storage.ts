export type StoredValue =
	| null
	| boolean
	| number
	| string
	| StoredValue[]
	| { [key: string]: StoredValue };
export type StoredEntry =
	{ found: false } | { found: true; value: StoredValue };

export interface PersistentStorage {
	read(key: string): Promise<StoredEntry>;
	increment(
		key: string,
		operationId: string,
		amount?: number,
	): Promise<number>;
}
