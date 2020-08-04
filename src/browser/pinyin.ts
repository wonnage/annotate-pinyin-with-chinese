(() => {
  chrome.runtime.onMessage.addListener(message => {
    if (message.request === 'refresh') {
      refresh();
    }
    if (message.request === 'cleanup') {
      cleanup();
    }
  });
  const [CHINESE_CODE_POINT_START, CHINESE_CODE_POINT_END] = [0x4e00, 0x9fff];
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      chrome.runtime.sendMessage({
        request: 'updateContextMenu',
        selection: selection,
      });
    }
  });

  const sendBackgroundMessage = (payload: {
    [key: string]: unknown;
  }): Promise<unknown> => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(
        (null as unknown) as string,
        payload,
        {},
        resolve
      );
    });
  };

  const isChinese = (char: string) => {
    const codePoint = char.codePointAt(0)!;
    return (
      CHINESE_CODE_POINT_START <= codePoint &&
      codePoint <= CHINESE_CODE_POINT_END
    );
  };

  const hasChinese = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      const codePoint = str.codePointAt(i)!;
      if (
        CHINESE_CODE_POINT_START <= codePoint &&
        codePoint <= CHINESE_CODE_POINT_END
      ) {
        return true;
      }
    }
    return false;
  };

  function needsPinyin(char: string, lookup: {[key: string]: string}) {
    return !!(isChinese(char) && lookup[char]);
  }

  const createRubyNode = (text: string, lookup: {[key: string]: string}) => {
    const ruby = document.createElement('ruby');
    ruby.className = 'pinyin-extension';
    const rts = [];
    let remaining = Array.from(text);
    while (remaining.length > 0) {
      const shouldShow = needsPinyin(remaining[0], lookup);
      const stop = remaining.findIndex(
        c => needsPinyin(c, lookup) !== shouldShow
      );
      const substr = stop === -1 ? remaining : remaining.slice(0, stop);
      const rb = document.createElement('rb');
      rb.textContent = substr.join('');
      ruby.appendChild(rb);
      if (!shouldShow) {
        rts.push(document.createElement('rt'));
      } else {
        const rt = document.createElement('rt');
        rt.textContent = substr.map(char => lookup[char]).join(' ');
        rts.push(rt);
      }
      remaining = stop === -1 ? [] : remaining.slice(stop, remaining.length);
    }

    ruby.append(...rts);
    return ruby;
  };

  const getTextNodesFromSelection = (selection: Selection) => {
    let commonAncestorContainer: Node = document.body;

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        commonAncestorContainer = range.commonAncestorContainer;
        while (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
          commonAncestorContainer = commonAncestorContainer.parentElement!;
        }
      }
    }
    const textNodes: Node[] = [];
    const walker = document.createTreeWalker(
      commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node = walker.nextNode();
    while (node) {
      if (
        node.parentNode!.nodeName !== 'RUBY' &&
        node.parentNode!.nodeName !== 'TITLE' &&
        node.parentNode!.nodeName !== 'SCRIPT'
      ) {
        if (hasChinese(node.nodeValue!)) {
          textNodes.push(node);
        }
      }
      node = walker.nextNode();
    }
    return textNodes;
  };

  const getCharactersFromTextNodes = (textNodes: Node[]): Set<string> => {
    const characters = new Set<string>();
    textNodes.forEach(node => {
      for (const character of node.textContent!) {
        if (isChinese(character)) {
          characters.add(character);
        }
      }
    });
    return characters;
  };

  const annotateTextNodesWithPinyin = (
    textNodes: Node[],
    characterToPinyinMap: {[key: string]: string}
  ) => {
    console.time('annotateTextNodesWithPinyin');
    for (const node of textNodes) {
      const ruby = createRubyNode(node.nodeValue!, characterToPinyinMap);
      node.parentElement!.replaceChild(ruby, node);
      if (ruby.parentElement) {
        ruby.parentElement.style.overflow = 'visible';
      }
    }
    console.timeEnd('annotateTextNodesWithPinyin');
  };

  const cleanup = () => {
    const parents = new Set(
      Array.from(document.querySelectorAll('ruby.pinyin-extension')).map(
        c => c.parentNode!
      )
    );
    parents.forEach(parent => {
      const rubies = parent.querySelectorAll('ruby.pinyin-extension');
      rubies.forEach(e => {
        const originalText = Array.from(e.childNodes)
          .filter(n => n.nodeName === 'RB')
          .map(n => n.textContent)
          .join('');
        e.replaceWith(document.createTextNode(originalText));
      });
      parent.normalize();
    });
  };

  const refresh = async () => {
    cleanup();
    const textNodes = getTextNodesFromSelection(window.getSelection()!);
    const characters = getCharactersFromTextNodes(textNodes);

    const characterToPinyinMap = (await sendBackgroundMessage({
      request: 'lookup',
      characters: Array.from(characters),
    })) as {
      [key: string]: string;
    };

    annotateTextNodesWithPinyin(textNodes, characterToPinyinMap);
  };
  refresh();
})();
