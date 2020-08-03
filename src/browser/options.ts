function saveOptions(e: Event) {
  e.preventDefault();
  const whitelistStr =
    (document.querySelector('#whitelist')! as HTMLTextAreaElement).value || '';
  const whitelist = whitelistStr.split(/[\s,]/);
  chrome.storage.local.set({
    hsk:
      (document.querySelector('#level')! as HTMLSelectElement).value ||
      'disabled',
    whitelist,
  });
}

function restoreOptions() {
  function setCurrentChoice(result: {[key: string]: any}) {
    (document.querySelector('#level')! as HTMLSelectElement).value =
      result.hsk || 'disabled';
    (document.querySelector('#whitelist')! as HTMLTextAreaElement).value =
      result.whitelist.join('\n') || '';
  }

  function onError(error: chrome.runtime.LastError) {
    console.log(`Error: ${error}`);
  }

  chrome.storage.local.get(['hsk', 'whitelist'], result => {
    if (chrome.runtime.lastError) {
      onError(chrome.runtime.lastError);
    }

    setCurrentChoice(result);
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('form')!.addEventListener('submit', saveOptions);
