let characterPinyinCache: {[key: string]: string} = {};
const characterLevelsCache: {[key: string]: number} = {};
let enabled: boolean | undefined;

function buildOnclickHandler(isRemove: boolean) {
  return function onclick(info: chrome.contextMenus.OnClickData) {
    chrome.storage.local.get('whitelist', items => {
      const existingItems = new Set(items.whitelist || []);
      const words = info.selectionText?.split('') || [];
      words.forEach(w =>
        isRemove ? existingItems.delete(w) : existingItems.add(w)
      );
      chrome.storage.local.set({whitelist: Array.from(existingItems)});
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
      id: 'disableAnnotations',
      title: 'Disable annotations',
      contexts: ['browser_action'],
      visible: false,
      async onclick(info, tab) {
        chrome.tabs.sendMessage(tab.id!, {request: 'cleanup'});
        chrome.contextMenus.update('disableAnnotations', {visible: false});
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
  filterLevel: number | undefined,
  whitelist: Set<string>
): {[key: string]: string} => {
  const out: {[key: string]: string} = {};
  for (const char of characters) {
    const level: number | undefined = characterLevelsCache[char];
    if (!whitelist.has(char) && level && filterLevel && level < filterLevel) {
      continue;
    }
    out[char] = characterPinyinCache[char];
  }
  console.log('mapping is', out);
  return out;
};

console.log('chrome is', chrome.runtime);

setupContextMenu();

chrome.browserAction.onClicked.addListener(tab => {
  console.log('clicked');
  executePinyinScript(tab.id!);
  enabled = true;
  chrome.contextMenus.update('disableAnnotations', {visible: true});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.request === 'lookup') {
    const {characters} = message as {characters: string[]};
    console.log(characters.length);
    chrome.storage.local.get(['hsk', 'whitelist'], items => {
      const whitelist = new Set<string>(items?.whitelist || []);
      const level = items?.hsk
        ? parseInt(items.hsk, 10) || undefined
        : undefined;
      console.log('whitelist is', whitelist);
      sendResponse(fetchCharactersMapping(characters, level, whitelist));
    });
    return true;
  } else if (message.request === 'updateContextMenu') {
    chrome.storage.local.get('whitelist', items => {
      const existingItems = new Set(items.whitelist || []);
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
console.log('finish init');
