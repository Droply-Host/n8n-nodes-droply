/**
 * Something the node can explain without Droply's help: a value the user typed, a file that cannot be
 * sent, a deployment that did not go live. Becomes a NodeOperationError with $description as the fix.
 */
export class Problem extends Error {
	/** Added when a clean-up after this problem also went wrong, so the user knows what was left behind. */
	note = '';

	constructor(
		message: string,
		readonly description = '',
	) {
		super(message);
	}
}
