import {
	NodeApiError,
	NodeOperationError,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { DroplyHttpError } from './client';
import { explain } from './errors';
import { UploadTooLarge } from './multipart';
import { Problem } from './problem';

/** Any failure inside the node, as the error n8n shows: NodeApiError for Droply's answers, NodeOperationError for the rest. */
export function toNodeError(
	ctx: IExecuteFunctions | ILoadOptionsFunctions,
	error: unknown,
	baseUrl: string,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}

	if (error instanceof DroplyHttpError) {
		const { message, description, withheld } = explain(
			error.status,
			error.body,
			error.headers,
			baseUrl,
		);
		const response = (
			!withheld && typeof error.body === 'object' && error.body !== null ? error.body : { message }
		) as JsonObject;

		return new NodeApiError(ctx.getNode(), response, {
			message,
			description: withNote(description, error.note),
			httpCode: String(error.status),
			itemIndex,
		});
	}

	if (error instanceof Problem) {
		return new NodeOperationError(ctx.getNode(), error.message, {
			description: withNote(error.description, error.note),
			itemIndex,
		});
	}

	if (error instanceof UploadTooLarge) {
		return new NodeOperationError(ctx.getNode(), error.message, {
			description: withNote('Publish fewer or smaller files in one go.', error.note),
			itemIndex,
		});
	}

	const detail = error instanceof Error ? error.message : String(error);

	return new NodeApiError(ctx.getNode(), { message: detail } as JsonObject, {
		message: 'Droply could not be reached',
		description: `Check the Base URL in the Droply API credential (${baseUrl}) and the network, then try again. ${detail}`,
		itemIndex,
	});
}

function withNote(description: string, note: string): string {
	return note === '' ? description : `${description} ${note}`.trim();
}
