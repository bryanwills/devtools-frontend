// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import type * as puppeteer from 'puppeteer';

import {$, getBrowserAndPages, step} from '../../shared/helper.js';
import {describe, it} from '../../shared/mocha-extensions.js';
import {CONSOLE_MESSAGE_WRAPPER_SELECTOR, deleteConsoleMessagesFilter, filterConsoleMessages, getConsoleMessages, getCurrentConsoleMessages, showVerboseMessages} from '../helpers/console-helpers.js';

type MessageCheck = (msg: string) => boolean;

function createUrlFilter(url: string) {
  return `-url:${url}`;
}

function collectSourceUrlsFromConsoleOutput(frontend: puppeteer.Page) {
  return frontend.evaluate(CONSOLE_MESSAGE_WRAPPER_SELECTOR => {
    return Array.from(document.querySelectorAll(CONSOLE_MESSAGE_WRAPPER_SELECTOR)).map(wrapper => {
      return wrapper.querySelector('.devtools-link').textContent.split(':')[0];
    });
  }, CONSOLE_MESSAGE_WRAPPER_SELECTOR);
}

function getExpectedMessages(unfilteredMessages: string[], filter: MessageCheck) {
  return unfilteredMessages.filter((msg: string) => {
    return filter(msg);
  });
}

async function testMessageFilter(filter: string, expectedMessageFilter: MessageCheck) {
  const {frontend} = getBrowserAndPages();
  let unfilteredMessages: string[];
  const showMessagesWithAnchor = true;

  await step('navigate to console-filter.html and get console messages', async () => {
    unfilteredMessages = await getConsoleMessages('console-filter', showMessagesWithAnchor);
  });

  await step(`filter to only show messages containing '${filter}'`, async () => {
    await filterConsoleMessages(frontend, filter);
  });

  await step('check that messages are correctly filtered', async () => {
    const filteredMessages = await getCurrentConsoleMessages(showMessagesWithAnchor);
    const expectedMessages = getExpectedMessages(unfilteredMessages, expectedMessageFilter);
    assert.isNotEmpty(filteredMessages);
    assert.deepEqual(filteredMessages, expectedMessages);
  });
}

describe('The Console Tab', async () => {
  it('shows logged messages', async () => {
    let messages: string[];
    const withAnchor = true;
    await step('navigate to console-filter.html and get console messages', async () => {
      messages = await getConsoleMessages('console-filter', withAnchor);
    });

    await step('check that all console messages appear', async () => {
      assert.deepEqual(messages, [
        'console-filter.html:10 1topGroup: log1()',
        'log-source.js:6 2topGroup: log2()',
        'console-filter.html:10 3topGroup: log1()',
        'console-filter.html:17 outerGroup',
        'console-filter.html:10 1outerGroup: log1()',
        'log-source.js:6 2outerGroup: log2()',
        'console-filter.html:21 innerGroup',
        'console-filter.html:10 1innerGroup: log1()',
        'log-source.js:6 2innerGroup: log2()',
        'console-filter.html:30 Hello 1',
        'console-filter.html:31 Hello 2',
        'console-filter.html:34 end',
      ]);
    });
  });

  it('shows messages from all levels', async () => {
    let messages: string[];
    const withAnchor = true;
    await step('navigate to console-filter.html and get console messages', async () => {
      messages = await getConsoleMessages('console-filter', withAnchor, showVerboseMessages);
    });

    await step('ensure that all levels are logged', async () => {
      const allLevelsDropdown = await $('[aria-label^="Log level: All levels"]');
      assert.isNotNull(allLevelsDropdown);
    });

    await step('check that all console messages appear', async () => {
      assert.deepEqual(messages, [
        'console-filter.html:10 1topGroup: log1()',
        'log-source.js:6 2topGroup: log2()',
        'console-filter.html:10 3topGroup: log1()',
        'console-filter.html:17 outerGroup',
        'console-filter.html:10 1outerGroup: log1()',
        'log-source.js:6 2outerGroup: log2()',
        'console-filter.html:21 innerGroup',
        'console-filter.html:10 1innerGroup: log1()',
        'log-source.js:6 2innerGroup: log2()',
        'console-filter.html:30 Hello 1',
        'console-filter.html:31 Hello 2',
        'console-filter.html:33 verbose debug message',
        'console-filter.html:34 end',
      ]);
    });
  });

  it('can exclude messages from a source url', async () => {
    const {frontend} = getBrowserAndPages();
    let sourceUrls: string[];
    let uniqueUrls: Set<string> = new Set();

    await step('navigate to console-filter.html and wait for console messages', async () => {
      await getConsoleMessages('console-filter');
    });

    await step('collect source urls from all messages', async () => {
      sourceUrls = await collectSourceUrlsFromConsoleOutput(frontend);
    });

    await step('find unique urls', async () => {
      uniqueUrls = new Set(sourceUrls);
      assert.isNotEmpty(uniqueUrls);
    });

    for (const urlToExclude of uniqueUrls) {
      const filter = createUrlFilter(urlToExclude);
      const expectedMessageFilter: MessageCheck = msg => {
        return msg.indexOf(urlToExclude) === -1;
      };
      await testMessageFilter(filter, expectedMessageFilter);

      await step(`remove filter '${filter}'`, async () => {
        await deleteConsoleMessagesFilter(frontend);
      });
    }
  });

  it('can include messages from a given source url', async () => {
    const {frontend} = getBrowserAndPages();
    let sourceUrls: string[];
    let uniqueUrls: Set<string> = new Set();

    await step('navigate to console-filter.html and wait for console messages', async () => {
      await getConsoleMessages('console-filter');
    });

    await step('collect source urls from all messages', async () => {
      sourceUrls = await collectSourceUrlsFromConsoleOutput(frontend);
    });

    await step('find unique urls', async () => {
      uniqueUrls = new Set(sourceUrls);
      assert.isNotEmpty(uniqueUrls);
    });

    for (const urlToKeep of uniqueUrls) {
      const filter = `url:${urlToKeep}`;
      const expectedMessageFilter: MessageCheck = msg => {
        return msg.indexOf(urlToKeep) !== -1;
      };
      await testMessageFilter(filter, expectedMessageFilter);

      await step(`remove filter '${filter}'`, async () => {
        await deleteConsoleMessagesFilter(frontend);
      });
    }
  });

  it('can apply empty filter', async () => {
    const filter = '';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const expectedMessageFilter: MessageCheck = _ => true;
    await testMessageFilter(filter, expectedMessageFilter);
  });

  it('can apply text filter', async () => {
    const filter = 'outer';
    const expectedMessageFilter: MessageCheck = msg => {
      // With new implementation of console group filtering, we also include child messages
      // if parent group is filtered.
      return msg.indexOf(filter) !== -1 || msg.indexOf('inner') !== -1;
    };
    await testMessageFilter(filter, expectedMessageFilter);
  });

  it('can apply start/end line regex filter', async () => {
    const filter = new RegExp(/.*Hello\s\d$/);
    const expectedMessageFilter: MessageCheck = msg => {
      return filter.test(msg);
    };
    await testMessageFilter(filter.toString(), expectedMessageFilter);
  });

  it('can apply context filter', async () => {
    const expectedMessageFilter: MessageCheck = msg => {
      return msg.indexOf('Hello') !== -1;
    };
    await testMessageFilter('context:context', expectedMessageFilter);
  });

  it('can apply multi text filter', async () => {
    const filter = 'Group /[2-3]top/';
    const expectedMessageFilter: MessageCheck = msg => {
      return /[2-3]top/.test(msg);
    };
    await testMessageFilter(filter, expectedMessageFilter);
  });

  it('can apply filter on anchor', async () => {
    const filter = new RegExp(/.*log-source\.js:\d+/);
    const expectedMessageFilter: MessageCheck = msg => {
      return filter.test(msg);
    };
    await testMessageFilter(filter.toString(), expectedMessageFilter);
  });

  it('can reset filter', async () => {
    const {frontend} = getBrowserAndPages();
    let unfilteredMessages: string[];

    await step('get unfiltered messages', async () => {
      unfilteredMessages = await getConsoleMessages('console-filter');
    });

    await step('apply message filter', async () => {
      await filterConsoleMessages(frontend, 'outer');
    });

    await step('delete message filter', async () => {
      deleteConsoleMessagesFilter(frontend);
    });

    await step('check if messages are unfiltered', async () => {
      const messages = await getCurrentConsoleMessages();
      assert.deepEqual(messages, unfilteredMessages);
    });
  });

  it('will show group parent message if child is filtered', async () => {
    const filter = '1outerGroup';
    const expectedMessageFilter: MessageCheck = msg => {
      return new RegExp(/.* (1|)outerGroup.*$/).test(msg);
    };
    await testMessageFilter(filter, expectedMessageFilter);
  });

  it('will show messages in group if group name is filtered', async () => {
    const filter = 'innerGroup';
    const expectedMessageFilter: MessageCheck = msg => {
      return msg.indexOf(filter) !== -1 || new RegExp(/.* outerGroup.*$/).test(msg);
    };
    await testMessageFilter(filter, expectedMessageFilter);
  });
});
