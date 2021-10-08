export async function httpCall<JsonResponse>(url: string, init?: RequestInit): Promise<JsonResponse> {
    return fetch(url, init)
        .then(async (response) => {
            if (response.status >= 200 && response.status <= 299) {
                return (await response.json()) as JsonResponse;
            }
            throw new Error(response.statusText);
        })
        .then((response: JsonResponse) => {
            return response;
        })
        .catch((error: string) => {
            throw new Error(error);
        });
}
