import { logMessage } from './Logger';
import { httpCall } from './Utils';

const APP_NAME = 'FrontifyFinder';
const APP_FINDER_TEMPLATE = 'external-asset-chooser';

type Settings = {
    container: HTMLElement;
    multiSelect?: boolean;
    filters?: FilterSettings[]
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

type GraphQlAssetsResponse = {
    data: FrontifyAssets|null;
}[];


type FrontifyAssets = {
    id: string;
}[];

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
    multiSelect: true
};

const ELEMENT: {
    event: boolean;
    container: HTMLElement|null;
    iframe: HTMLIFrameElement|null;
    window: Window;
} = {
    event: false,
    container: null,
    iframe: null,
    window: window,
};

let finderToken: TokenConfiguration;
let finderSettings: Settings|null= null;
let isOpen: boolean = false;

export async function open(token: TokenConfiguration, settings: Settings): Promise<FrontifyAssets|void>{

    if (isOpen) {
        logMessage('warning', {
            code: 'WARN_FINDER_OPEN',
            message: "Finder window is already open!",
        });
        return;
    }

    isOpen = true;

    if (settings.multiSelect === undefined) {
        settings.multiSelect = DEFAULT_SETTINGS.multiSelect;
    }

    finderToken = token;
    finderSettings = settings;

    ELEMENT.iframe = document.createElement('iframe');
    ELEMENT.iframe.style.display = 'none';
    ELEMENT.iframe.style.width = 'inherit';
    ELEMENT.iframe.style.height = 'inherit';
    ELEMENT.iframe.style.overflow = 'auto';
    ELEMENT.iframe.style.border = '0';
    ELEMENT.iframe.setAttribute('src', `https://${token.bearerToken.domain}/${APP_FINDER_TEMPLATE}`);
    ELEMENT.iframe.setAttribute('name', `${APP_NAME}Frame`);
    ELEMENT.iframe.style.display = 'block';

    ELEMENT.container = settings.container;
    ELEMENT.container.appendChild(ELEMENT.iframe);
    ELEMENT.container.style.display = 'block';

    if (!ELEMENT.event) {
        ELEMENT.event = true;
        ELEMENT.window.addEventListener('message', messageHandler);
    }

    return new Promise((resolve, reject) => {
        assetSelectionListener((assets: FrontifyAssets) => {
            resolve(assets);
        }, () => {
            reject();
        });
    });
}

function assetSelectionListener(success = (assets: FrontifyAssets) => {}, cancel = () => {}) {
    ELEMENT.iframe?.addEventListener('assetSelectionEvent', (event: CustomEventInit) => {
        const assetIds: number[] = [];
        const assets: FrontifyAssets = [];
        event.detail.assetSelection.forEach((element: {id: number}) => {
            assetIds.push(element.id);
        });

        httpCall('https://' + finderToken.bearerToken.domain + '/graphql', {
            method: 'POST',
            headers: {
                authorization: `${finderToken.bearerToken.tokenType} ${finderToken.bearerToken.accessToken}`,
                'content-type': 'application/json',
                'X-Frontify-Beta': 'enabled'
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
                    icon: previewUrl
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
                }`,
                variables: { ids: assetIds }})
        }).then((response: any) => {
            assets.push(response.data.assets);
        }).catch((error) => {
            throw new Error("Failed fetching assets data");
        });

        success(assets);
    });
    ELEMENT.iframe?.addEventListener('assetCancelEvent', () => cancel());
}

function messageHandler(e: FinderEvent) {
    if (!e.data) {
        return;
    }

    if (e.data.error) {
        const parsedError = JSON.parse(e.data.error);

        if (parsedError && parsedError.status === 401) {
            console.log('error');
        }

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
            'https://' + finderToken?.bearerToken.domain
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

function handleAssetSelection(assetSelection: Assets) {
    ELEMENT.iframe?.dispatchEvent(new CustomEvent<{ assetSelection: Assets }>('assetSelectionEvent', { detail: { assetSelection } }));
}

function handleAssetCancel() {
    ELEMENT.iframe?.dispatchEvent(new CustomEvent('assetCancelEvent'));
}

function close() {
    isOpen = false;

    if (ELEMENT.container && ELEMENT.container.style.display !== 'none') {
        ELEMENT.container.style.display = 'none';
        ELEMENT.iframe?.parentNode?.removeChild(ELEMENT.iframe);
    }
}
