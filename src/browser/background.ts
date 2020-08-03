let characterPinyinCache: {[key: string]: string} = {};
const characterLevelsCache: {[key: string]: number} = {};

function buildOnclickHandler(isRemove: boolean) {
  return function onclick(info: chrome.contextMenus.OnClickData) {
    chrome.storage.local.get('pinyin', items => {
      const existingItems = new Set(items.pinyin || []);
      const words = info.selectionText?.split('') || [];
      words.forEach(w =>
        isRemove ? existingItems.delete(w) : existingItems.add(w)
      );
      chrome.storage.local.set({pinyin: Array.from(existingItems)});
      chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        chrome.tabs.sendMessage(tabs[0]!.id!, {request: 'refresh'});
      });
    });
  };
}

const setupContextMenu = async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      title: 'Annotate with Pinyin %s',
      contexts: ['selection'],
      async onclick(info, tab) {
        executePinyinScript(tab.id!);
      },
    });
    chrome.contextMenus.create({
      title: 'Always show Pinyin for %s',
      contexts: ['selection'],
      onclick: buildOnclickHandler(false),
      id: 'whitelistmenuitem',
    });
  });

  fetch(chrome.extension.getURL('src/browser/unihan.json')).then(
    async response => {
      characterPinyinCache = await response.json();
    }
  );
  fetch(chrome.extension.getURL('src/browser/hsk.json')).then(
    async response => {
      await response.json().then((resp: string[][]) =>
        resp.map((set, idx) =>
          set.forEach(char => {
            characterLevelsCache[char] = idx + 1;
          })
        )
      );
    }
  );
};

const executePinyinScript = (tabId: number) => {
  chrome.tabs.executeScript(tabId, {
    file: 'src/browser/pinyin.js',
  });
};

const fetchCharactersMapping = (
  characters: string[],
  whitelist: Set<string>
): {[key: string]: string} => {
  const out: {[key: string]: string} = {};
  for (const char of characters) {
    const level: number | undefined = characterLevelsCache[char];
    if (!whitelist.has(char) && level && level < 4) {
      continue;
    }
    out[char] = characterPinyinCache[char];
  }
  console.log('mapping is', out);
  return out;
};

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();

  chrome.browserAction.onClicked.addListener(tab => {
    executePinyinScript(tab.id!);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.request === 'lookup') {
    const {characters} = message as {characters: string[]};
    console.log(characters.length);
    chrome.storage.local.get('pinyin', items => {
      const whitelist = new Set<string>(items?.pinyin || []);
      console.log('whitelist is', whitelist);
      sendResponse(fetchCharactersMapping(characters, whitelist));
    });
    return true;
  } else if (message.request === 'updateContextMenu') {
    chrome.storage.local.get('pinyin', items => {
      const existingItems = new Set(items.pinyin || []);
      if (
        message.selection
          .toString()
          .split('')
          .every((c: string) => existingItems.has(c))
      ) {
        chrome.contextMenus.update('whitelistmenuitem', {
          title: 'Remove %s from whitelist',
          onclick: buildOnclickHandler(true),
        });
      } else {
        chrome.contextMenus.update('whitelistmenuitem', {
          title: 'Add %s to whitelist',
          onclick: buildOnclickHandler(false),
        });
      }
    });
    sendResponse('');
  }
  return;
});
