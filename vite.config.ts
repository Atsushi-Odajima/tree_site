import { defineConfig, type Plugin, type Connect } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderAddonRows, renderCalcExample, renderPriceRows, renderServiceCards, renderServices } from './src/render/static-html.ts';

const root = __dirname;

/** 静的 HTML の <span data-icon="lucide-name"></span> を SVG に置き換える（JS なしでも表示） */
function inlineIcon(name: string): string {
  const svg = readFileSync(resolve(root, 'node_modules/lucide-static/icons', `${name}.svg`), 'utf-8');
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace('<svg', '<svg class="icon" aria-hidden="true" focusable="false"')
    .replace(/\s(width|height)="24"/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/** `<!-- @include name -->` を partials/name.html の内容に置き換え、アイコンを埋め込む */
function htmlPartials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name: string) =>
            readFileSync(resolve(root, 'partials', `${name}.html`), 'utf-8'),
          )
          .replace('<div class="services" data-services></div>', `<div class="services" data-services>${renderServices()}</div>`)
          .replace(/<tbody data-price-rows>[\s\S]*?<\/tbody>/, `<tbody data-price-rows>${renderPriceRows()}</tbody>`)
          .replace('<ul class="svc-cards" data-service-cards></ul>', `<ul class="svc-cards" data-service-cards>${renderServiceCards()}</ul>`)
          .replace('<tbody data-addon-rows></tbody>', `<tbody data-addon-rows>${renderAddonRows()}</tbody>`)
          .replace('<div class="calc" data-calc-example></div>', `<div class="calc" data-calc-example>${renderCalcExample()}</div>`)
          .replace(/<span data-icon="([\w-]+)"><\/span>/g, (_, name: string) => inlineIcon(name));
      },
    },
  };
}

/** 開発・プレビューで /estimate と /admin を末尾スラッシュなしで直接開けるようにする */
function cleanUrls(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url) {
      const [path, query] = req.url.split('?');
      if (path === '/estimate' || path === '/admin') {
        req.url = `${path}/index.html${query ? `?${query}` : ''}`;
      }
    }
    next();
  };
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [htmlPartials(), cleanUrls()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        estimate: resolve(root, 'estimate/index.html'),
        admin: resolve(root, 'admin/index.html'),
      },
    },
  },
});
