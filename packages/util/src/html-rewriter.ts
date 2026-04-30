const YT_DOMAINS = ['youtube.com', 'youtu.be'];
const EMBEDDABLE_DOMAINS = new Set([...YT_DOMAINS, 'videopress.com']);

export function escapeHtmlAttribute(value: string) {
  return value.replaceAll(/[&"'<>]/g, (character) => {
    switch (character) {
      case '&': {
        return '&amp;';
      }
      case '"': {
        return '&quot;';
      }
      case "'": {
        return '&#39;';
      }
      case '<': {
        return '&lt;';
      }
      case '>': {
        return '&gt;';
      }
      default: {
        return character;
      }
    }
  });
}

export function getSafeEmbeddableUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const domain = url.hostname.replace('www.', '');

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !EMBEDDABLE_DOMAINS.has(domain)
    ) {
      return null;
    }

    return {
      domain,
      href: url.href,
    };
  } catch {
    return null;
  }
}

const getYoutubeID = (url: string) => {
  if (!url) {
    return false;
  }

  const match = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e|watch|embed)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (match && match[1]) {
    const id = match[1];

    if (id === 'live_stream') {
      return false;
    }

    return id;
  }

  return false;
};

const Renderers = {
  liteYoutube(videoId: string) {
    return `<lite-youtube videoid="${videoId}"></lite-youtube>`;
  },

  sandboxedIframe(src: string, title: string) {
    return `
      <iframe
        src="${escapeHtmlAttribute(src)}"
        title="${escapeHtmlAttribute(title)}"
        frameborder="0"
        loading="lazy"
        allowfullscreen
        style="max-width:100%;aspect-ratio:16/9;"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      ></iframe>`;
  },
};

export class ElementHandler {
  element(element: Element) {
    element.removeAttribute('id');
    element.removeAttribute('class');
    element.removeAttribute('style');
  }
}

export class LinksHandler {
  element(element: Element) {
    const href = element.getAttribute('href');
    if (!href) {
      return;
    }

    let external = false;

    if (href.startsWith('http')) {
      try {
        const url = new URL(href);

        if (url.hostname !== 'wpm.so' && !url.hostname.endsWith('.wpm.so')) {
          external = true;
        }
      } catch {
        external = true;
      }
    }

    if (external) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'nofollow noopener noreferrer');
    } else {
      element.removeAttribute('rel');
      element.removeAttribute('target');
    }
  }
}

export class ImgHandler {
  element(element: Element) {
    element.setAttribute('loading', 'lazy');
    element.setAttribute('decoding', 'async');
  }
}

export class ShortcodeHandler {
  state: EmbedsState;
  shortcode: string = '';

  constructor(state: EmbedsState) {
    this.state = state;
  }

  text(chunk: Text) {
    const t = chunk.text.trim();
    if (!t.startsWith('[')) {
      return;
    }

    this.shortcode += t;

    if (this.shortcode.startsWith('[youtube') && this.shortcode.endsWith(']')) {
      const url = this.shortcode.replace('[youtube', '').replace(']', '').trim();

      const videoId = getYoutubeID(url);
      if (videoId) {
        chunk.replace(Renderers.liteYoutube(videoId), { html: true });
        this.state.foundYoutube = true;
      }

      this.shortcode = '';
    }
  }
}

export class EmbedsState {
  ytLoaded: boolean = false;
  foundYoutube: boolean = false;
}

export class EnqueuedEmbedAsset {
  state: EmbedsState;

  constructor(state: EmbedsState) {
    this.state = state;
  }

  element(element: Element) {
    if (this.state.foundYoutube && !this.state.ytLoaded) {
      element.append(
        `<style>lite-youtube{background-color:#000;position:relative;display:block;contain:content;background-position:center center;background-size:cover;cursor:pointer;max-width:100%}lite-youtube::before{content:attr(data-title);display:block;position:absolute;top:0;background-image:linear-gradient(180deg,rgb(0 0 0 / 67%) 0,rgb(0 0 0 / 54%) 14%,rgb(0 0 0 / 15%) 54%,rgb(0 0 0 / 5%) 72%,rgb(0 0 0 / 0%) 94%);height:99px;width:100%;font-family:"YouTube Noto",Roboto,Arial,Helvetica,sans-serif;color:hsl(0deg 0% 93.33%);text-shadow:0 0 2px rgba(0,0,0,.5);font-size:18px;padding:25px 20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;box-sizing:border-box}lite-youtube>.lyt-playbtn,lite-youtube>iframe{width:100%;height:100%;border:0;position:absolute}lite-youtube:hover::before{color:#fff}lite-youtube::after{content:"";display:block;padding-bottom:calc(100% / (16 / 9))}lite-youtube>iframe{top:0;left:0}lite-youtube>.lyt-playbtn{display:block;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 48"><path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="red"/><path d="M45 24 27 14v20" fill="white"/></svg>') center/68px 48px no-repeat;cursor:pointer;z-index:1;filter:grayscale(100%);transition:filter .1s cubic-bezier(0, 0, .2, 1)}lite-youtube .lyt-playbtn:focus,lite-youtube:hover>.lyt-playbtn{filter:none}lite-youtube.lyt-activated{cursor:unset}lite-youtube.lyt-activated::before,lite-youtube.lyt-activated>.lyt-playbtn{opacity:0;pointer-events:none}.lyt-visually-hidden{clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}</style>`,
        { html: true },
      );
      element.append(`<script async src="/js/lite-yt.js"></script>`, { html: true });

      this.state.ytLoaded = true;
    }
  }
}

export class EmbedHandler {
  state: EmbedsState;

  constructor(state: EmbedsState) {
    this.state = state;
  }

  element(element: Element) {
    const href = element.getAttribute('href');
    if (!href) {
      return;
    }

    const safeEmbed = getSafeEmbeddableUrl(href);
    if (!safeEmbed) {
      return;
    }

    if (YT_DOMAINS.includes(safeEmbed.domain)) {
      this.state.foundYoutube = true;
      const videoId = getYoutubeID(href);
      if (videoId) {
        element.replace(Renderers.liteYoutube(videoId), { html: true });
      }

      return;
    }

    element.replace(
      Renderers.sandboxedIframe(safeEmbed.href, element.getAttribute('title') || ''),
      {
        html: true,
      },
    );
  }
}

export class ScreenshotHandler {
  packageName: string;

  constructor(packageName: string) {
    this.packageName = packageName;
  }

  element(element: Element) {
    if (element.tagName === 'a') {
      const href = element.getAttribute('href');
      if (!href) {
        return;
      }

      if (href.startsWith('/screenshot-')) {
        element.setAttribute(
          'href',
          `https://usercontent.wpm.so/readme-images/${this.packageName}/assets${href}`,
        );
      }
    }

    if (element.tagName === 'img') {
      const src = element.getAttribute('src');
      if (!src) {
        return;
      }

      if (src.startsWith('/screenshot-')) {
        element.setAttribute(
          'src',
          `https://usercontent.wpm.so/readme-images/${this.packageName}/assets${src}`,
        );
      }
    }
  }
}
