import React, { useContext, useMemo } from 'react';
import { FlagProvider, IFlagProvider, UnleashClient } from '@unleash/proxy-client-react';
import { DeepRequired } from 'utility-types';
import { captureException } from '@sentry/react';
import * as Sentry from '@sentry/react';
import ChromeAuthContext, { ChromeAuthContextValue } from '../../auth/ChromeAuthContext';
import { isBeta } from '../../utils/common';

const config: IFlagProvider['config'] = {
  url: `${document.location.origin}/api/featureflags/v0`,
  clientKey: 'proxy-123',
  appName: 'web',
  headerName: 'X-Unleash-Auth',
  refreshInterval: 60000,
  metricsInterval: 120000,
  fetch: (url: URL, headers: RequestInit) => {
    /**
     * The default fetch handler in the client does not handle 500 errors and does not set the error flag or calls the on('error') listener.
     * So we need a little bit of cheating to unblock the flagError and flagsReady variables
     */
    return window
      .fetch(url, headers)
      .then((resp) => {
        // prevent the request from falling back to default error behavior
        //add warning level
        if (resp.status >= 400) {
          Sentry.captureMessage(`Feature loading error server error! ${resp.status}: ${resp.statusText}.`, 'warning');
          throw new Error(`Feature loading error server error! ${resp.status}: ${resp.statusText}.`);
        }

        const contentType = resp.headers.get('content-type');
        // make sure the response has correct content type
        // in case the API falls back to the chrome HTML template
        if (!contentType?.includes('application/json')) {
          throw new Error(`Feature loading error server error! Invalid response content type. Expected 'application/json, got: ${contentType}'`);
        }
        return resp;
      })
      .catch((err) => {
        captureException(err);
        // set the error flag
        localStorage.setItem(UNLEASH_ERROR_KEY, 'true');
        return {
          headers: {
            get: () => '',
          },
          json: () => Promise.resolve({ toggles: [] }),
          ok: true,
        };
      });
  },
};

export const UNLEASH_ERROR_KEY = 'chrome:feature-flags:error';

/**
 * Clear error localstorage flag before initialization
 */
localStorage.setItem(UNLEASH_ERROR_KEY, 'false');

export let unleashClient: UnleashClient;
export const getFeatureFlagsError = () => localStorage.getItem(UNLEASH_ERROR_KEY) === 'true';

const FeatureFlagsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user } = useContext(ChromeAuthContext) as DeepRequired<ChromeAuthContextValue>;
  unleashClient = useMemo(
    () =>
      new UnleashClient({
        ...config,
        context: {
          // TODO: instead of the isBeta, use the internal chrome state
          // the unleash context is not generic, look for issue/PR in the unleash repo or create one
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          'platform.chrome.ui.preview': isBeta(),
          userId: user?.identity.internal?.account_id,
          orgId: user?.identity.internal?.org_id,
          ...(user
            ? {
                properties: {
                  account_number: user?.identity.account_number,
                  email: user?.identity.user.email,
                },
              }
            : {}),
        },
      }),
    []
  );
  return <FlagProvider unleashClient={unleashClient}>{children}</FlagProvider>;
};

export default FeatureFlagsProvider;
