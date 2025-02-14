// Script to be injected into all frames
(function() {
  // Only set up once
  if (window._frameCapturePending) return;
  window._frameCapturePending = true;

  async function waitForDependencies() {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total

    while ((!window.html2canvas || !window.captureUtils) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.html2canvas || !window.captureUtils) {
      throw new Error('Required dependencies not loaded');
    }

    return true;
  }

  async function setupFrameCapture() {
    try {
      // Ensure dependencies are available
      await waitForDependencies();

      // Wait for parent to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      const frameId = window.frameElement ? window.frameElement.id || 'unnamed-frame' : 'main-frame';
      console.log(`Setting up capture for frame: ${frameId}`);

      // Handle capture requests
      window.addEventListener('message', async (event) => {
        if (event.data.type !== 'capture-request') return;

        console.log(`Frame ${frameId} received capture request`);

        try {
          // Prepare all media elements
          const mediaElements = [...document.getElementsByTagName('img'), ...document.getElementsByTagName('video')];
          const mediaPromises = mediaElements.map(async element => {
            element.crossOrigin = 'anonymous';
            try {
              await captureUtils.waitForElement(element);
              return true;
            } catch (e) {
              console.warn(`Failed to prepare element:`, e);
              return false;
            }
          });

          // Wait for all media elements with a timeout
          await Promise.race([
            Promise.all(mediaPromises),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Media preparation timeout')), 10000))
          ]);

          // Capture all media elements
          const mediaCaptures = await Promise.all(
            mediaElements.map(async element => {
              try {
                const rect = element.getBoundingClientRect();
                const capture = await captureUtils.captureElement(element);
                if (!capture) {
                  console.warn(`Failed to capture element: ${element.tagName}`);
                  return null;
                }
                return {
                  type: element.tagName.toLowerCase(),
                  src: capture,
                  position: {
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY,
                    width: rect.width,
                    height: rect.height
                  }
                };
              } catch (e) {
                console.warn(`Error capturing element:`, e);
                return null;
              }
            })
          ).then(captures => captures.filter(c => c !== null));

          // Request captures from all nested frames
          const frames = [...document.getElementsByTagName('iframe')];
          const frameCaptures = await Promise.all(
            frames.map(async frame => {
              try {
                const rect = frame.getBoundingClientRect();
                
                // Request capture from nested frame
                frame.contentWindow.postMessage({ type: 'capture-request' }, '*');
                
                // Wait for response with timeout
                const response = await Promise.race([
                  new Promise((resolve, reject) => {
                    const handler = event => {
                      if (event.data.type === 'capture-response' && event.source === frame.contentWindow) {
                        window.removeEventListener('message', handler);
                        if (event.data.error) {
                          reject(new Error(event.data.error));
                        } else {
                          resolve(event.data);
                        }
                      }
                    };
                    window.addEventListener('message', handler);
                  }),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Frame capture timeout')), 10000)
                  )
                ]).catch(error => {
                  console.warn(`Frame capture failed:`, error);
                  return { baseCapture: null, mediaCaptures: [], frameCaptures: [] };
                });

                return {
                  ...response,
                  position: {
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY,
                    width: rect.width,
                    height: rect.height
                  }
                };
              } catch (e) {
                console.warn(`Error capturing frame:`, e);
                return null;
              }
            })
          ).then(captures => captures.filter(c => c !== null));

          // Capture the base page content
          const pageCanvas = await html2canvas(document.documentElement, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: true,
            onclone: (clonedDoc) => {
              // Remove all media elements and iframes from the clone
              // as we'll composite them separately
              const elements = clonedDoc.querySelectorAll('img, video, iframe');
              elements.forEach(el => el.remove());
            }
          });

          if (!pageCanvas) {
            throw new Error('Failed to create base capture');
          }

          // Send response back to parent
          window.parent.postMessage({
            type: 'capture-response',
            frameId,
            baseCapture: pageCanvas.toDataURL('image/png'),
            mediaCaptures,
            frameCaptures
          }, '*');
        } catch (error) {
          console.error('Error during frame capture:', error);
          // Send error response
          window.parent.postMessage({
            type: 'capture-response',
            frameId,
            error: error.message,
            baseCapture: null,
            mediaCaptures: [],
            frameCaptures: []
          }, '*');
        }
      });

      // If this is not the main frame, notify parent we're ready
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'frame-ready', frameId }, '*');
      }
    } catch (error) {
      console.error('Failed to setup frame capture:', error);
    }
  }

  // Initialize capture setup
  setupFrameCapture().catch(console.error);
})();