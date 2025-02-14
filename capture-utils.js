// Shared capture utilities
(function() {
  // Only define if not already defined
  if (window.captureUtils) return;

  window.captureUtils = {
    async captureVideo(video) {
      if (!video) return null;
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      const ctx = canvas.getContext('2d');
      
      try {
        if (video.paused) {
          await video.play().catch(() => {
            console.warn('Failed to play video for capture');
          });
        }
        
        // Ensure video has valid dimensions
        if (canvas.width === 0 || canvas.height === 0) {
          console.warn('Invalid video dimensions for capture');
          return null;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('Video capture failed:', e);
        return null;
      }
    },

    async captureElement(element) {
      if (!element) return null;

      try {
        if (element.tagName === 'VIDEO') {
          return await this.captureVideo(element);
        }

        if (element.tagName === 'IMG') {
          const canvas = document.createElement('canvas');
          const width = element.naturalWidth || element.clientWidth;
          const height = element.naturalHeight || element.clientHeight;
          
          // Ensure image has valid dimensions
          if (width === 0 || height === 0) {
            console.warn('Invalid image dimensions for capture');
            return null;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(element, 0, 0);
          return canvas.toDataURL('image/png');
        }
      } catch (e) {
        console.warn(`Element capture failed:`, e);
        return null;
      }

      return null;
    },

    async waitForElement(element) {
      if (!element) return;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Element load timeout'));
        }, 5000);

        if (element.tagName === 'VIDEO') {
          if (element.readyState >= 2) {
            clearTimeout(timeout);
            resolve();
          } else {
            const loadHandler = () => {
              clearTimeout(timeout);
              resolve();
            };
            const errorHandler = (error) => {
              clearTimeout(timeout);
              reject(error);
            };
            element.addEventListener('loadeddata', loadHandler, { once: true });
            element.addEventListener('error', errorHandler, { once: true });
          }
        } else if (element.tagName === 'IMG') {
          if (element.complete) {
            clearTimeout(timeout);
            resolve();
          } else {
            const loadHandler = () => {
              clearTimeout(timeout);
              resolve();
            };
            const errorHandler = (error) => {
              clearTimeout(timeout);
              reject(error);
            };
            element.addEventListener('load', loadHandler, { once: true });
            element.addEventListener('error', errorHandler, { once: true });
          }
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    }
  };
})();