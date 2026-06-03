import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteServer } from './support/vite-server.js';

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.text();
}

test('served app shell and critical assets load through HTTP', async () => {
  await withViteServer(async (baseUrl) => {
    const html = await fetchText(`${baseUrl}/`);

    assert.match(html, /Takeoff — Plan Measurement Tool/);
    assert.match(html, /href="\.\/app\/styles\.css"/);
    assert.match(html, /src="\.\/src\/main\.js(?:\?[^"]+)?"/);

    const [styles, main, pointerController, sidebarView] = await Promise.all([
      fetchText(`${baseUrl}/app/styles.css`),
      fetchText(`${baseUrl}/src/main.js`),
      fetchText(`${baseUrl}/src/app/pointer-controller.js`),
      fetchText(`${baseUrl}/src/app/sidebar-view.js`),
    ]);

    assert.match(styles, /body\.no-document/);
    assert.match(main, /import "\/src\/app\/pointer-controller\.js";/);
    assert.match(pointerController, /TakeoffPointerController/);
    assert.match(sidebarView, /TakeoffSidebarView/);
  });
});
