import { logMessage } from './Logger';
import { Popup, PopupConfiguration } from './Popup';
import {
    AuthenticationConfig,
    Token,
    computeAuthorizationUrl,
    pollOauthSession,
    retrieveAccessToken,
    refreshToken,
    revokeToken
} from './Oauth';

const DOMAIN_WINDOW_DEFAULT_URL = 'https://dev.frontify.test/finder';
const POPUP_DEFAULT_TITLE = 'Authorize Frontify';
const POPUP_STATE = {
    open: false
}

let popup: Popup;

export async function authorize(
    configuration: AuthenticationConfig,
    popupConfiguration?: PopupConfiguration
): Promise<Token | void>{

    if (POPUP_STATE.open) {
        logMessage('warning', {
            code: 'ERR_POPUP_OPEN',
            message: 'Popup already open!'
        })
        throw new Error('Popup already open!');
    }

    popup = createPopUp(
        popupConfiguration ?? {
            title: POPUP_DEFAULT_TITLE,
            width: 800,
            height: 600,
            top: 50,
            left: 50,
        },
    );

    POPUP_STATE.open = true;

    if (!configuration.domain) {
        return openDomainPopUp(configuration, popup).then((res) => {
            POPUP_STATE.open = false;
            if (res) {
                return res;
            }
        }).catch(() => {
            delete(configuration.domain);
            logMessage('error', {
                code: 'ERR_AUTH_SKIPPED',
                message: 'Domain not inserted!'
            });
            throw new Error('Domain not inserted!');
        });
    } else {
        return authenticate(configuration, popup).then((res) => {
            POPUP_STATE.open = false;
            if (res) {
                return res;
            }
        }).catch((error) => {
            POPUP_STATE.open = false;
            throw new Error(error);
        });
    }
}

async function authenticate(configuration: AuthenticationConfig, popUp: Popup): Promise<Token> {
    try {
        const { authorizationUrl, codeVerifier, sessionId } = await computeAuthorizationUrl(configuration);
        await openAuthPopUp(authorizationUrl, popUp);
        const authorizationCode = await pollOauthSession(configuration, sessionId);
        return retrieveAccessToken(configuration, authorizationCode, codeVerifier);
    } catch (error) {
        const errorMessage = `Error generating session. Make sure that the inserted domain is a valid and secure Frontify instance.`;
        popUp.popUp?.postMessage({domainError: errorMessage}, '*');
        logMessage('error', {
            code: 'ERR_AUTH_FAILED',
            message: errorMessage
        });
        throw new Error(errorMessage);
    }
}

export async function refresh(token: Token): Promise<Token> {
    return refreshToken(token.bearerToken.domain, token.bearerToken.refreshToken, token.clientId, token.scopes);
}

export async function revoke(token: Token): Promise<Token> {
    await revokeToken(token.bearerToken.domain, token.bearerToken.accessToken)
    return token;
}

function openDomainPopUp(configuration: AuthenticationConfig, popUp: Popup): Promise<Token> {
    popUp.navigateToUrl(DOMAIN_WINDOW_DEFAULT_URL);

    logMessage('warning', {
        code: 'WARN_DOMAIN_OPEN',
        message: 'Popup window opened!'
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            POPUP_STATE.open = false;
            popUp.close();
            reject();
            logMessage('error', {
                code: 'ERR_DOMAIN_TIMEOUT',
                message: 'Popup window timeout!'
            })
        }, 5 * 60 * 1000);

        popUp.onDomain(() => {
            clearTimeout(timeout);
            configuration.domain = popup.getDomain();
            authenticate(configuration, popup).then((result) => {
                resolve(result);
            }).catch((error) => {
                throw new Error(error ?? 'Could not verify instance!');
            });
            logMessage('warning', {
                code: 'WARN_DOMAIN_SELECT',
                message: 'Domain input submitted!'
            })
        });

        popUp.onAborted(() => {
            POPUP_STATE.open = false;
            clearTimeout(timeout);
            popUp.close();
            reject();
            logMessage('warning', {
                code: 'WARN_DOMAIN_CLOSED',
                message: 'Popup window closed!'
            })
        });
    });
}

function openAuthPopUp(url: string, popUp: Popup): Promise<void> {
    popUp.navigateToUrl(url);

    logMessage('warning', {
        code: 'WARN_DOMAIN_OPEN',
        message: 'Popup window opened!'
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            POPUP_STATE.open = false;
            popUp.close();
            reject();
            logMessage('error', {
                code: 'ERR_DOMAIN_TIMEOUT',
                message: 'Popup window timeout!'
            })
        }, 5 * 60 * 1000);

        popUp.onAborted(() => {
            POPUP_STATE.open = false;
            clearTimeout(timeout);
            popUp.close();
            reject();
            logMessage('warning', {
                code: 'WARN_DOMAIN_CLOSED',
                message: 'Popup window closed!'
            })
        });

        popUp.onSuccess(() => {
            POPUP_STATE.open = false;
            clearTimeout(timeout);
            popUp.close();
            resolve();
            logMessage('warning', {
                code: 'WARN_AUTH_SUCCESS',
                message: 'Auth success!'
            })
        });

        popUp.onCancelled(() => {
            POPUP_STATE.open = false;
            clearTimeout(timeout);
            popUp.close();
            reject();
            logMessage('warning', {
                code: 'WARN_AUTH_CANCELLED',
                message: 'Auth cancelled!'
            })
        });
    });
}

function createPopUp(configuration: PopupConfiguration): Popup {
    return new Popup(configuration ?? {});
}



///////////////////// FRONTIFY FINDER /////////////////////

const APP_NAME = 'FrontifyFinder';
const APP_FINDER_TEMPLATE = 'external-asset-chooser';

type Settings = {
    container: HTMLElement;
    multiSelect?: boolean;
    filters?: FilterSettings[],
    popup?: PopupConfiguration
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

type Assets = Asset[];
type Asset = {
    id?: number;
};

type FinderCustomEvent = {
    detail: {
        assetsSelection: Assets;
    }
}

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

let assetsSelection: Assets|null = null;
let finderToken: TokenConfiguration;
let finderSettings: Settings|null= null;
let isOpen: boolean = false;

export async function open(token: TokenConfiguration, settings: Settings): Promise<Event>{
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
        assetSelectionListener((e: Event) => {
            resolve(e);
        }, () => {
            reject();
        });
    });
}

function assetSelectionListener(success = (event: Event) => {}, cancel = () => {}) {
    ELEMENT.iframe?.addEventListener('assetSelectionEvent', (event: Event) => success(event));
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
    ELEMENT.iframe?.dispatchEvent(new CustomEvent('assetSelectionEvent', { detail: { assetSelection } }));
}

function handleAssetCancel() {
    ELEMENT.iframe?.dispatchEvent(new CustomEvent('assetCancelEvent'));
}

function close() {
    isOpen = false;

    if (ELEMENT.container && ELEMENT.container.style.display !== 'none') {
        ELEMENT.container.style.display = 'none';
        ELEMENT.iframe?.parentNode?.removeChild(ELEMENT.iframe);
        assetsSelection = [{}];
    }
}
