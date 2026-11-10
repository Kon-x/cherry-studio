import { expect, test } from './fixtures/electron.fixture'

const MARKDOWN = [
  'before-block-marker',
  '',
  '```html',
  '<iframe src="https://example.invalid/x" height="120"></iframe>',
  '```',
  '',
  'after-block-marker'
].join('\n')

test('inline HTML iframe preview settles and stays stable across scrolling', async ({ mainWindow: page }, testInfo) => {
  await page.route('https://example.invalid/x', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Embedded preview</title>' })
  )
  await page.evaluate(async () => {
    await window.api.preference.setMultiple({
      'app.language': 'en-US',
      'app.onboarding.provider_setup.status': 'skipped',
      'app.privacy.policy_version': '20260820'
    })
  })
  await page.reload()
  await page.waitForSelector('#root')

  const topicId = await page.evaluate(async (markdown) => {
    const assistantResponse = await window.api.dataApi.request({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/assistants',
      body: { name: `HTML preview height ${Date.now()}` }
    })
    if (assistantResponse.error) throw new Error(assistantResponse.error.message)
    const assistant = assistantResponse.data as { id: string }
    const topicResponse = await window.api.dataApi.request({
      id: crypto.randomUUID(),
      method: 'POST',
      path: '/topics',
      body: { name: `HTML preview height ${Date.now()}`, assistantId: assistant.id }
    })
    if (topicResponse.error) throw new Error(topicResponse.error.message)
    const topic = topicResponse.data as { id: string }
    const surroundingMessages = (count: number) =>
      Array.from({ length: count }, (_, index) => `Scroll space ${index}\n\nSurrounding message`)
    for (const text of [...surroundingMessages(6), markdown, ...surroundingMessages(16)]) {
      const message = await window.api.dataApi.request({
        id: crypto.randomUUID(),
        method: 'POST',
        path: `/topics/${topic.id}/messages`,
        body: { role: 'assistant', status: 'success', data: { parts: [{ type: 'text', text }] } }
      })
      if (message.error) throw new Error(message.error.message)
    }
    return topic.id
  }, MARKDOWN)

  await page.reload()
  await page.waitForSelector('#root')
  await page.evaluate(
    (id) => window.api.ipcApi.request('navigation.open_route_in_main', { path: `/app/chat?topicId=${id}` }),
    topicId
  )
  const messageList = page.locator('[data-message-virtual-list-scroller]').filter({ visible: true }).first()
  await messageList.hover()
  await page.mouse.wheel(0, -10000)
  const artifact = page.getByTestId('message-html-artifact').first()
  await artifact.waitFor({ state: 'attached' })
  await artifact.scrollIntoViewIfNeeded()
  await expect(artifact).toBeVisible()
  await expect(artifact.getByTestId('html-artifact-surface').locator('iframe')).toBeAttached()
  await expect(page.getByText('after-block-marker', { exact: true })).toBeVisible()
  const sampling = await page.evaluateHandle(async () => {
    const surface = document.querySelector<HTMLElement>('[data-testid="html-artifact-surface"]')
    const marker = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === 'after-block-marker')
    const frame = surface?.querySelector('iframe')
    if (!surface || !marker || !frame)
      throw new Error(
        `Expected preview nodes: ${JSON.stringify({ surface: !!surface, marker: !!marker, frame: !!frame })}`
      )
    const scroller = surface.closest<HTMLElement>('[data-message-virtual-list-scroller]')
    if (!scroller) throw new Error('Expected message-list scroller')
    let styleMutations = 0
    const observer = new MutationObserver((records) => {
      styleMutations += records.length
    })
    observer.observe(surface, { attributes: true, attributeFilter: ['style'] })
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const read = () => ({
      styleHeight: surface.style.height,
      height: surface.getBoundingClientRect().height,
      paragraphTop: marker.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
      rootOverflow: frame.contentDocument!.documentElement.scrollHeight - frame.clientHeight
    })
    const samples: ReturnType<typeof read>[] = []
    try {
      const deadline = performance.now() + 10000
      let quietSince = performance.now()
      let previous = ''
      let ready = false
      while (performance.now() < deadline) {
        await nextFrame()
        const doc = frame.contentDocument
        const intendedDocument =
          doc?.URL !== 'about:blank' &&
          doc?.querySelector('iframe[src="https://example.invalid/x"]') &&
          doc.readyState === 'complete' &&
          doc.fonts.status === 'loaded'
        const current = intendedDocument ? JSON.stringify({ ...read(), styleMutations }) : ''
        if (!current || current !== previous) quietSince = performance.now()
        previous = current
        if (current && performance.now() - quietSince >= 500) {
          ready = true
          break
        }
      }
      if (!ready) {
        throw new Error(
          `Preview did not settle: ${JSON.stringify({
            connected: frame.isConnected,
            url: frame.contentDocument?.URL,
            readyState: frame.contentDocument?.readyState,
            fonts: frame.contentDocument?.fonts.status,
            hasEmbeddedFrame: Boolean(frame.contentDocument?.querySelector('iframe[src="https://example.invalid/x"]')),
            geometry: frame.contentDocument ? read() : null,
            styleMutations
          })}`
        )
      }
      const effectiveCap = 0.72 * scroller.clientHeight
      const settledSurfaceHeight = surface.getBoundingClientRect().height
      if (effectiveCap <= settledSurfaceHeight + 8) {
        throw new Error(
          `Effective preview cap ${effectiveCap} CSS px must exceed settled surface height ${settledSurfaceHeight} CSS px by more than 8 CSS px`
        )
      }
      styleMutations = 0
      observer.takeRecords()
      const started = performance.now()
      do {
        await nextFrame()
        samples.push(read())
      } while (performance.now() - started < 1500 || samples.length < 30)
      const elapsed = performance.now() - started
      const samplingMutations = styleMutations + observer.takeRecords().length
      const sampledSurfaceTop = surface.getBoundingClientRect().top
      return {
        measurements: { effectiveCap, elapsed, samples, samplingMutations, sampledSurfaceTop },
        finish: () => {
          const sameSurface =
            surface.isConnected && surface === document.querySelector('[data-testid="html-artifact-surface"]')
          const returned = sameSurface ? read() : null
          const totalMutations = styleMutations + observer.takeRecords().length
          observer.disconnect()
          return { sameSurface, returned, totalMutations }
        }
      }
    } catch (error) {
      observer.disconnect()
      throw error
    }
  })
  const sampled = await sampling.evaluate((state) => state.measurements)
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
  expect(sampled.elapsed).toBeGreaterThanOrEqual(1500)
  expect(sampled.samples.length).toBeGreaterThanOrEqual(30)
  expect(new Set(sampled.samples.map((sample) => sample.styleHeight)).size).toBe(1)
  expect(spread(sampled.samples.map((sample) => sample.height))).toBeLessThanOrEqual(0.25)
  expect(spread(sampled.samples.map((sample) => sample.paragraphTop))).toBeLessThanOrEqual(0.25)
  expect(new Set(sampled.samples.map((sample) => sample.scrollTop)).size).toBe(1)
  expect(Math.max(...sampled.samples.map((sample) => sample.rootOverflow))).toBeLessThanOrEqual(1)
  expect(sampled.samplingMutations).toBe(0)

  const beforeScroll = await sampling.evaluate((state) => state.finish())
  await sampling.dispose()
  expect(beforeScroll.totalMutations).toBe(0)
  const initialParagraphOffset = sampled.samples[0].paragraphTop - sampled.sampledSurfaceTop
  const surface = page.getByTestId('html-artifact-surface').filter({ visible: true })
  const inMessageViewport = () =>
    messageList.evaluate((element) => {
      const preview = element.querySelector('[data-testid="html-artifact-surface"]')
      if (!preview) return false
      const rect = preview.getBoundingClientRect()
      const viewport = element.getBoundingClientRect()
      return rect.top >= viewport.top && rect.bottom <= viewport.bottom
    })
  await messageList.hover()
  for (let step = 0; step < 25; step += 1) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(120)
    const offscreen = await messageList.evaluate((element) => {
      const preview = element.querySelector('[data-testid="html-artifact-surface"]')
      return !preview || preview.getBoundingClientRect().bottom < element.getBoundingClientRect().top
    })
    if (offscreen) break
  }
  await expect(artifact).not.toBeInViewport()
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(120)
    if (await inMessageViewport()) break
  }
  await expect.poll(inMessageViewport).toBe(true)
  const returnedGeometry = () =>
    surface.evaluate((element) => {
      const marker = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === 'after-block-marker')!
      return {
        height: element.getBoundingClientRect().height,
        styleHeight: (element as HTMLElement).style.height,
        paragraphOffset: marker.getBoundingClientRect().top - element.getBoundingClientRect().top
      }
    })
  await expect(async () => {
    const back = await returnedGeometry()
    expect(back.styleHeight).toBe(sampled.samples[0].styleHeight)
    expect(Math.abs(back.height - sampled.samples[0].height)).toBeLessThanOrEqual(0.25)
    expect(Math.abs(back.paragraphOffset - initialParagraphOffset)).toBeLessThanOrEqual(0.25)
  }).toPass({ timeout: 10000 })
  await testInfo.attach('height-measurements', {
    body: JSON.stringify({ ...sampled, beforeScroll, back: await returnedGeometry() }, null, 2),
    contentType: 'application/json'
  })

  const screenshotPath = testInfo.outputPath('html-artifact-preview-height.png')
  await page.bringToFront()
  await page.waitForTimeout(250)
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach('html-artifact-preview-height', { path: screenshotPath, contentType: 'image/png' })
})
