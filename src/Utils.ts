import { FinderError } from './Exception';

export function getFinderStoragePrefix(): string {
    return 'FRONTIFY_FINDER';
}

export function computeStorageKey(clientId: string): string {
    return `${getFinderStoragePrefix()}-${clientId}`;
}

export async function httpCall<JsonResponse>(url: string, init?: RequestInit): Promise<JsonResponse> {
    return fetch(url, init)
        .then(async (response) => {
            if (response.status >= 200 && response.status <= 299) {
                return (await response.json()) as JsonResponse;
            }
            throw new FinderError('ERR_FINDER_HTTP_REQUEST', response.statusText);
        })
        .then((response: JsonResponse) => {
            return response;
        })
        .catch((error: Error) => {
            if (error instanceof FinderError) {
                throw error;
            }

            throw new FinderError('ERR_FINDER_HTTP_REQUEST', error.message);
        });
}
