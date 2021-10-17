import { FinderError } from './Exception';
import { logMessage } from './Logger';

const APP_NAME = 'FrontifyFinder';
const APP_FINDER_TEMPLATE = 'external-asset-chooser';
const APP_GRAPHQL_ENDPOINT = '/graphql';

interface AssetsResponse {
    errors?: AssetsResponseError[];
    data?: {
        assets: FrontifyAssets;
    };
    extensions: {
        beta?: AssetsResponseBetaExtension[];
        complexityScore: number;
    };
}

type AssetsResponseError = {
    extensions: {
        category: string;
    };
    locations: AssetsResponseErrorLocation[];
    message: string;
};

type AssetsResponseErrorLocation = {
    column: number;
    line: number;
};

type AssetsResponseBetaExtension = {
    message: string;
};

type Settings = {
    container: HTMLElement;
    multiSelect?: boolean;
    filters?: FilterSettings[];
};

type FilterSettings = {
    key: string;
    values: string[];
    inverted: boolean;
};

type FinderEvent = {
    data: {
        aborted: boolean;
        assetsChosen: [];
        configurationRequested: boolean;
        error: string;
    };
};

type FrontifyAssets = FrontifyAsset[];

type FrontifyAsset = {
    id: string;
    title: string;
    description: string;
    creator: {
        name: string;
    };
    createdAt: string;
    type: string;
    licenses?: {
        title: string;
        text: string;
    };
    copyright?: {
        status: string;
        notice: string;
    };
    tags?: {
        value: string;
        source: string;
    };
    metadataValues?: {
        value: string | number;
        metadataField: {
            id: string;
            label: string;
        };
    };
    filename: string;
    size: number;
    downloadUrl: URL;
    previewUrl: URL;
    focalPoint?: number[];
    width?: number;
    height?: number;
    duration?: number;
    bitrate?: number;
};

type Assets = Asset[];
type Asset = {
    id?: number;
};

type TokenConfiguration = {
    bearerToken: {
        tokenType: string;
        expiresIn: number;
        accessToken: string;
        refreshToken: string;
        domain: string;
    };
    clientId: string;
    scopes: string[];
};

const DEFAULT_SETTINGS: {
    multiSelect: boolean;
} = {
    multiSelect: true,
};

const ELEMENT: {
    event: boolean;
    container: HTMLElement | null;
    iframe: HTMLIFrameElement | null;
    window: Window;
} = {
    event: false,
    container: null,
    iframe: null,
    window: window,
};

let finderToken: TokenConfiguration;
let finderSettings: Settings | null = null;
let isOpen = false;

export async function open(token: TokenConfiguration, settings: Settings): Promise<FrontifyAssets> {
    if (isOpen) {
        close();
    }

    isOpen = true;

    if (settings.multiSelect === undefined) {
        settings.multiSelect = DEFAULT_SETTINGS.multiSelect;
    }

    finderToken = token;
    finderSettings = settings;

    setElement(token.bearerToken.domain, settings.container);

    return new Promise((resolve) => {
        assetSelectionListener(
            (assets: FrontifyAssets) => {
                resolve(assets);
            },
            () => {
                logMessage('warning', {
                    code: 'WARN_FINDER_CANCELLED',
                    message: 'Finder cancelled.',
                });
            },
        );
    });
}

function setElement(domain: string, container: HTMLElement): void {
    ELEMENT.iframe = document.createElement('iframe');
    ELEMENT.iframe.style.display = 'none';
    ELEMENT.iframe.style.width = 'inherit';
    ELEMENT.iframe.style.height = 'inherit';
    ELEMENT.iframe.style.overflow = 'auto';
    ELEMENT.iframe.style.border = '0';
    ELEMENT.iframe.setAttribute('src', `https://${domain}/${APP_FINDER_TEMPLATE}`);
    ELEMENT.iframe.setAttribute('name', `${APP_NAME}Frame`);
    ELEMENT.iframe.style.display = 'block';

    ELEMENT.container = container;
    ELEMENT.container.appendChild(ELEMENT.iframe);
    ELEMENT.container.style.display = 'block';

    if (!ELEMENT.event) {
        ELEMENT.event = true;
        ELEMENT.window.addEventListener('message', messageHandler);
    }
}

function assetSelectionListener(success: (assets: FrontifyAssets) => void, cancel: () => void): void {
    ELEMENT.iframe?.addEventListener('assetSelectionEvent', (event: CustomEventInit) => {
        const assetIds: number[] = [];
        event.detail.assetSelection.forEach((element: { id: number }) => {
            assetIds.push(element.id);
        });

        fetch(`https://${finderToken.bearerToken.domain}${APP_GRAPHQL_ENDPOINT}`, {
            method: 'POST',
            headers: {
                authorization: `${finderToken.bearerToken.tokenType} ${finderToken.bearerToken.accessToken}`,
                'content-type': 'application/json',
                'X-Frontify-Beta': 'enabled',
            },
            body: JSON.stringify({
                query: `
                    query AssetByIds($ids: [ID!]!) {
                        assets(ids: $ids) {
                            id
                            title
                            description
                            creator {
                                name
                            }
                            createdAt
                            type: __typename
                            ...withTags
                            ...withCopyright
                            ...withLicenses
                            ...withMetadata
                            ...onImage
                            ...onDocument
                            ...onFile
                            ...onAudio
                            ...onVideo
                        }
                    }

                    fragment withLicenses on Asset {
                        licenses {
                            title
                            text: license
                        }
                    }

                    fragment withCopyright on Asset {
                        copyright {
                            status
                            notice
                        }
                    }

                    fragment withTags on Asset {
                        tags {
                            value
                            source
                        }
                    }

                    fragment withMetadata on Asset {
                        metadataValues {
                            value
                            metadataField {
                                id
                                label
                            }
                        }
                    }

                    fragment onImage on Image {
                        filename
                        size
                        downloadUrl(validityInDays: 1)
                        previewUrl
                        width
                        height
                        focalPoint
                    }

                    fragment onFile on File {
                        filename
                        size
                        downloadUrl(validityInDays: 1)
                        previewUrl
                    }

                    fragment onDocument on Document {
                        filename
                        size
                        downloadUrl(validityInDays: 1)
                        previewUrl
                        focalPoint
                    }

                    fragment onAudio on Audio {
                        filename
                        size
                        downloadUrl(validityInDays: 1)
                        previewUrl
                    }

                    fragment onVideo on Video {
                        filename
                        size
                        downloadUrl(validityInDays: 1)
                        previewUrl
                        width
                        height
                        duration
                        bitrate
                    }
                `,
                variables: { ids: assetIds },
            }),
        })
            .then(async (response): Promise<AssetsResponse> => {
                if (response.status >= 200 && response.status <= 299) {
                    return await response.json();
                }
                throw new FinderError('ERR_FINDER_SELECT_ASSETS', response.statusText);
            })
            .then((result: AssetsResponse) => {
                if (result.errors) {
                    logMessage('error', {
                        code: 'ERR_FINDER_SELECT_ASSETS',
                        message: 'Error selecting assets.',
                    });
                }

                if (!result.data || !result.data.assets) {
                    throw new FinderError('ERR_FINDER_SELECT_ASSETS_EMPTY', 'No assets data returned.');
                }

                success(result.data.assets);
            })
            .catch((error): void => {
                if (error instanceof FinderError) {
                    throw new FinderError(error.code, error.message);
                }

                throw new FinderError('ERR_FINDER_SELECT_ASSETS', error);
            });
    });
    ELEMENT.iframe?.addEventListener('assetCancelEvent', () => cancel());
}

function messageHandler(e: FinderEvent): void {
    if (!e.data) {
        return;
    }

    if (e.data.error) {
        logMessage('error', {
            code: 'ERR_FINDER_MESSAGE',
            message: e.data.error,
        });
    }

    if (e.data.configurationRequested) {
        ELEMENT.iframe?.contentWindow?.postMessage(
            {
                token: finderToken?.bearerToken.accessToken,
                multiSelectionAllowed: finderSettings?.multiSelect,
                filters: finderSettings?.filters,
            },
            `https://${finderToken?.bearerToken.domain}`,
        );
    }

    if (e.data.assetsChosen) {
        handleAssetSelection(e.data.assetsChosen);
        close();
    }

    if (e.data.aborted) {
        handleAssetCancel();
        close();
    }
}

function handleAssetSelection(assetSelection: Assets): void {
    ELEMENT.iframe?.dispatchEvent(
        new CustomEvent<{ assetSelection: Assets }>('assetSelectionEvent', { detail: { assetSelection } }),
    );
}

function handleAssetCancel(): void {
    ELEMENT.iframe?.dispatchEvent(new CustomEvent('assetCancelEvent'));
}

function close(): void {
    isOpen = false;

    if (ELEMENT.container && ELEMENT.container.style.display !== 'none') {
        ELEMENT.container.style.display = 'none';
        ELEMENT.iframe?.parentNode?.removeChild(ELEMENT.iframe);
    }
}
