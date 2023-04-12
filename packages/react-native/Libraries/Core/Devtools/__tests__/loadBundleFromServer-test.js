/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

jest.mock('react-native/Libraries/Utilities/HMRClient');

jest.mock('react-native/Libraries/Core/Devtools/getDevServer', () =>
  jest.fn(() => ({
    url: 'localhost:8042/',
    fullBundleUrl:
      'http://localhost:8042/EntryPoint.bundle?platform=' +
      jest.requireActual<$FlowFixMe>('react-native').Platform.OS +
      '&dev=true&minify=false&unusedExtraParam=42',
    bundleLoadedFromServer: true,
  })),
);

const loadingViewMock = {
  showMessage: jest.fn(),
  hide: jest.fn(),
};
jest.mock(
  'react-native/Libraries/Utilities/LoadingView',
  () => loadingViewMock,
);

const sendRequest = jest.fn(
  (
    method,
    trackingName,
    url,
    headers,
    data,
    responseType,
    incrementalUpdates,
    timeout,
    callback,
    withCredentials,
  ) => {
    callback(1);
  },
);

jest.mock('react-native/Libraries/Network/RCTNetworking', () => ({
  __esModule: true,
  default: {
    sendRequest,
    addListener: jest.fn((name, fn) => {
      if (name === 'didReceiveNetworkData') {
        setImmediate(() => fn([1, mockDataResponse]));
      } else if (name === 'didCompleteNetworkResponse') {
        setImmediate(() => fn([1, null]));
      } else if (name === 'didReceiveNetworkResponse') {
        setImmediate(() => fn([1, null, mockHeaders]));
      }
      return {remove: () => {}};
    }),
  },
}));

let loadBundleFromServer: (bundlePathAndQuery: string) => Promise<void>;

let mockHeaders: {'Content-Type': string};
let mockDataResponse;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  loadBundleFromServer = require('../loadBundleFromServer');
});

test('loadBundleFromServer will throw for JSON responses', async () => {
  mockHeaders = {'Content-Type': 'application/json'};
  mockDataResponse = JSON.stringify({message: 'Error thrown from Metro'});

  await expect(
    loadBundleFromServer('/Fail.bundle?platform=ios'),
  ).rejects.toThrow('Error thrown from Metro');
});

test('loadBundleFromServer will request a bundle if import bundles are available', async () => {
  mockDataResponse = '"code";';
  mockHeaders = {'Content-Type': 'application/javascript'};

  await loadBundleFromServer(
    '/Banana.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
  );

  expect(sendRequest.mock.calls).toEqual([
    [
      'GET',
      expect.anything(),
      'localhost:8042/Banana.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    ],
  ]);

  sendRequest.mockClear();
  await loadBundleFromServer(
    '/Tiny/Apple.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
  );

  expect(sendRequest.mock.calls).toEqual([
    [
      'GET',
      expect.anything(),
      'localhost:8042/Tiny/Apple.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    ],
  ]);
});

test('shows and hides the loading view around a request', async () => {
  mockDataResponse = '"code";';
  mockHeaders = {'Content-Type': 'application/javascript'};

  const promise = loadBundleFromServer(
    '/Banana.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
  );

  expect(loadingViewMock.showMessage).toHaveBeenCalledTimes(1);
  expect(loadingViewMock.hide).not.toHaveBeenCalled();
  loadingViewMock.showMessage.mockClear();
  loadingViewMock.hide.mockClear();

  await promise;

  expect(loadingViewMock.showMessage).not.toHaveBeenCalled();
  expect(loadingViewMock.hide).toHaveBeenCalledTimes(1);
});

test('shows and hides the loading view around concurrent requests', async () => {
  mockDataResponse = '"code";';
  mockHeaders = {'Content-Type': 'application/javascript'};

  const promise1 = loadBundleFromServer(
    '/Banana.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
  );
  const promise2 = loadBundleFromServer(
    '/Apple.bundle?platform=ios&dev=true&minify=false&unusedExtraParam=42&modulesOnly=true&runModule=false',
  );

  expect(loadingViewMock.showMessage).toHaveBeenCalledTimes(2);
  expect(loadingViewMock.hide).not.toHaveBeenCalled();
  loadingViewMock.showMessage.mockClear();
  loadingViewMock.hide.mockClear();

  await promise1;
  await promise2;
  expect(loadingViewMock.hide).toHaveBeenCalledTimes(1);
});