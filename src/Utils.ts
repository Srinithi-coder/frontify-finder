import { FinderError } from './Exception';

export async function httpCall<JsonResponse>(url: string, init?: RequestInit): Promise<JsonResponse | void> {
    return fetch(url, init)
        .then(async (response) => {
            if (response.status >= 200 && response.status <= 299) {
                return (await response.json()) as JsonResponse;
            }
            throw new FinderError('ERR_HTTP_REQUEST', response.statusText);
        })
        .then((response: JsonResponse) => {
            return response;
        })
        .catch((error: FinderError | string): void => {
            if (error instanceof FinderError) {
                throw new FinderError(error.code, error.message);
            }

            throw new FinderError('ERR_HTTP_REQUEST', error);
        });
}
