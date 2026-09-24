  (() => {
    const initializeGallery = (root) => {
      if (!root || root.dataset.galleryZoomInitialized === "true") return;

      root.dataset.galleryZoomInitialized = "true";

      const overlay = root.nextElementSibling;
      if (!overlay || !overlay.matches(".gallery-zoom-overlay")) return;

      const zoomImage = overlay.querySelector(".gallery-zoom-image");
      const zoomCaption = overlay.querySelector(".gallery-zoom-caption");
      const closeButton = overlay.querySelector(".gallery-zoom-close");
      const prevButton = overlay.querySelector(".gallery-zoom-prev");
      const nextButton = overlay.querySelector(".gallery-zoom-next");

      // ------------------------------------------------------------
      // CAPTION LAYOUT
      // Reserve the height of the tallest caption so the carousel
      // does not jump vertically as captions change.
      // ------------------------------------------------------------
      const captionItems = Array.from(
        root.querySelectorAll("[data-gallery-carousel-item]")
      );

      const captions = captionItems
        .map((item) => item.querySelector("figcaption"))
        .filter((caption) => caption);

      if (captions.length >= 2) {
        const measureAndFixCaptionHeight = () => {
          const maxHeight = Math.max(
            ...captions.map((caption) =>
              Math.ceil(caption.getBoundingClientRect().height)
            )
          );

          captions.forEach((caption) => {
            caption.style.minHeight = `${maxHeight}px`;
          });
        };

        window.requestAnimationFrame(measureAndFixCaptionHeight);
        window.addEventListener("resize", measureAndFixCaptionHeight);
      }

      // ------------------------------------------------------------
      // INLINE CAROUSEL
      // Keep this independent of TW Elements so interval, arrows,
      // indicators, and active-slide state are deterministic.
      // ------------------------------------------------------------
      const carouselTrack = root.querySelector(".gallery-carousel-track");

      const carouselItems = Array.from(
        root.querySelectorAll("[data-gallery-carousel-item]")
      );

      const carouselIndicators = Array.from(
        root.querySelectorAll("[data-gallery-slide-to]")
      );

      const carouselPrev = root.querySelector("[data-gallery-prev]");
      const carouselNext = root.querySelector("[data-gallery-next]");

      let carouselIndex = 0;
      let carouselTimer = null;

      const carouselInterval = Math.max(
        0,
        Number(root.dataset.galleryInterval || 0)
      );

      const stopCarouselTimer = () => {
        if (carouselTimer !== null) {
          window.clearInterval(carouselTimer);
          carouselTimer = null;
        }
      };

      const startCarouselTimer = () => {
        stopCarouselTimer();

        if (carouselInterval > 0 && carouselItems.length > 1) {
          carouselTimer = window.setInterval(() => {
            updateCarousel(carouselIndex + 1, false);
          }, carouselInterval);
        }
      };

      const updateCarousel = (index, restartTimer = true) => {
        if (!carouselTrack || !carouselItems.length) return;

        carouselIndex =
          (index + carouselItems.length) % carouselItems.length;

        carouselTrack.style.transform =
          `translateX(-${carouselIndex * 100}%)`;

        carouselIndicators.forEach((indicator, i) => {
          const active = i === carouselIndex;

          indicator.classList.toggle("opacity-100", active);
          indicator.classList.toggle("opacity-50", !active);

          indicator.setAttribute(
            "aria-current",
            active ? "true" : "false"
          );
        });

        if (restartTimer) {
          startCarouselTimer();
        }
      };

      const nextCarousel = () => {
        updateCarousel(carouselIndex + 1);
      };

      const prevCarousel = () => {
        updateCarousel(carouselIndex - 1);
      };

      carouselIndicators.forEach((indicator, index) => {
        indicator.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          updateCarousel(index);
        });
      });

      carouselPrev?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        prevCarousel();
      });

      carouselNext?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        nextCarousel();
      });

      // ------------------------------------------------------------
      // INLINE CAROUSEL SWIPE
      // Horizontal swipes navigate the carousel.
      // Vertical gestures continue to scroll the page normally.
      // ------------------------------------------------------------
      const swipeThreshold = 50;
      let touchStartX = 0;
      let touchStartY = 0;
      let touchTracking = false;
      let lastCarouselSwipeAt = 0;

      carouselItems.forEach((item) => {
        const image = item.querySelector("[data-gallery-zoom-index]");
        if (!image) return;

        image.addEventListener(
          "touchstart",
          (event) => {
            if (event.touches.length !== 1) {
              touchTracking = false;
              return;
            }

            const touch = event.touches[0];

            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchTracking = true;
          },
          { passive: true }
        );

        image.addEventListener(
          "touchend",
          (event) => {
            if (!touchTracking || event.changedTouches.length !== 1) {
              touchTracking = false;
              return;
            }

            touchTracking = false;

            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            // Ignore short movements and primarily-vertical gestures.
            if (
              Math.abs(deltaX) < swipeThreshold ||
              Math.abs(deltaX) <= Math.abs(deltaY)
            ) {
              return;
            }

            lastCarouselSwipeAt = Date.now();

            if (deltaX < 0) {
              nextCarousel();
            } else {
              prevCarousel();
            }
          },
          { passive: true }
        );

        image.addEventListener(
          "touchcancel",
          () => {
            touchTracking = false;
          },
          { passive: true }
        );
      });

      updateCarousel(0, false);
      startCarouselTimer();

      // ------------------------------------------------------------
      // LIGHTBOX
      // ------------------------------------------------------------
      const items = carouselItems;
      let currentIndex = 0;
      const previousBodyOverflow = document.body.style.overflow;

      const updateLightbox = (index) => {
        if (!items.length) return;

        currentIndex = (index + items.length) % items.length;

        resetLightboxZoom();

        const item = items[currentIndex];
        const sourceImage = item.querySelector(
          "[data-gallery-zoom-index]"
        );
        const sourceCaption = item.querySelector("figcaption");

        if (!sourceImage) return;

        zoomImage.src = sourceImage.currentSrc || sourceImage.src;
        zoomImage.alt = sourceImage.alt || "";

        if (
          sourceCaption &&
          sourceCaption.textContent.trim() !== ""
        ) {
          zoomCaption.innerHTML = sourceCaption.innerHTML;
          zoomCaption.hidden = false;
        } else {
          zoomCaption.innerHTML = "";
          zoomCaption.hidden = true;
        }
      };

      // ------------------------------------------------------------
      // LIGHTBOX GESTURES
      // 1 finger at 1x  -> swipe between images
      // 2 pointers      -> pinch to zoom
      // 1 pointer > 1x  -> pan the zoomed image
      // Wheel/trackpad  -> zoom fallback for desktop/devtools
      // ------------------------------------------------------------
      const MIN_LIGHTBOX_ZOOM = 1;
      const MAX_LIGHTBOX_ZOOM = 4;
      const lightboxSwipeThreshold = 50;

      let zoomScale = MIN_LIGHTBOX_ZOOM;
      let zoomX = 0;
      let zoomY = 0;

      const activePointers = new Map();
      let lightboxGesture = null;
      let lightboxTouchStartX = 0;
      let lightboxTouchStartY = 0;

      // Chrome DevTools can emulate pinch with Shift + mouse drag.
      // In that mode the image can receive a mouse PointerEvent rather
      // than a touch/pen pointer, so keep a dedicated zoom state for it.
      let devtoolsZoomPointerId = null;
      let devtoolsZoomStartY = 0;
      let devtoolsZoomStartScale = MIN_LIGHTBOX_ZOOM;

      let pinchStartDistance = 0;
      let pinchStartScale = MIN_LIGHTBOX_ZOOM;

      let panStartX = 0;
      let panStartY = 0;
      let panOriginX = 0;
      let panOriginY = 0;

      const applyLightboxTransform = () => {
        zoomImage.style.transform =
          `translate3d(${zoomX}px, ${zoomY}px, 0) scale(${zoomScale})`;
      };

      const resetLightboxZoom = () => {
        zoomScale = MIN_LIGHTBOX_ZOOM;
        zoomX = 0;
        zoomY = 0;
        lightboxGesture = null;
        pinchStartDistance = 0;
        activePointers.clear();

        zoomImage.style.transform =
          "translate3d(0, 0, 0) scale(1)";
      };

      const getPointerDistance = () => {
        const pointers = Array.from(activePointers.values());
        if (pointers.length < 2) return 0;

        const dx = pointers[0].x - pointers[1].x;
        const dy = pointers[0].y - pointers[1].y;

        return Math.hypot(dx, dy);
      };

      const clampLightboxPan = () => {
        if (zoomScale <= MIN_LIGHTBOX_ZOOM) {
          zoomX = 0;
          zoomY = 0;
          return;
        }

        const figure = overlay.querySelector(".gallery-zoom-figure");
        if (!figure) return;

        const figureRect = figure.getBoundingClientRect();
        const imageWidth = zoomImage.offsetWidth * zoomScale;
        const imageHeight = zoomImage.offsetHeight * zoomScale;

        const maxX = Math.max(0, (imageWidth - figureRect.width) / 2);
        const maxY = Math.max(0, (imageHeight - figureRect.height) / 2);

        zoomX = Math.min(maxX, Math.max(-maxX, zoomX));
        zoomY = Math.min(maxY, Math.max(-maxY, zoomY));
      };

      const zoomBy = (factor, centerX = null, centerY = null) => {
        const previousScale = zoomScale;

        zoomScale = Math.min(
          MAX_LIGHTBOX_ZOOM,
          Math.max(MIN_LIGHTBOX_ZOOM, zoomScale * factor)
        );

        if (zoomScale <= MIN_LIGHTBOX_ZOOM) {
          resetLightboxZoom();
          return;
        }

        // Keep the point underneath the fingers/cursor roughly stationary
        // while zooming. This makes both pinch and DevTools zoom feel natural.
        if (
          centerX !== null &&
          centerY !== null &&
          previousScale > 0
        ) {
          const figure = overlay.querySelector(".gallery-zoom-figure");
          const rect = figure?.getBoundingClientRect();

          if (rect) {
            const factorFromScale = zoomScale / previousScale;
            const originX = centerX - (rect.left + rect.width / 2);
            const originY = centerY - (rect.top + rect.height / 2);

            zoomX -= originX * (factorFromScale - 1);
            zoomY -= originY * (factorFromScale - 1);
          }
        }

        clampLightboxPan();
        applyLightboxTransform();
      };

      zoomImage.addEventListener(
        "pointerdown",
        (event) => {
          if (overlay.hidden) return;

          // Chrome DevTools mobile emulation can represent its
          // Shift + drag pinch gesture as a mouse pointer on the image.
          // Treat upward/downward Shift-drag as zoom so the image behaves
          // the same way as the black lightbox backdrop.
          if (event.pointerType === "mouse") {
            if (!event.shiftKey) return;

            event.preventDefault();

            lightboxGesture = "devtools-zoom";
            devtoolsZoomPointerId = event.pointerId;
            devtoolsZoomStartY = event.clientY;
            devtoolsZoomStartScale = zoomScale;

            zoomImage.setPointerCapture?.(event.pointerId);
            return;
          }

          activePointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });

          zoomImage.setPointerCapture?.(event.pointerId);

          if (activePointers.size === 2) {
            lightboxGesture = "pinch";
            pinchStartDistance = getPointerDistance();
            pinchStartScale = zoomScale;
            return;
          }

          if (activePointers.size !== 1) {
            lightboxGesture = null;
            return;
          }

          if (zoomScale > MIN_LIGHTBOX_ZOOM) {
            lightboxGesture = "pan";
            panStartX = event.clientX;
            panStartY = event.clientY;
            panOriginX = zoomX;
            panOriginY = zoomY;
            return;
          }

          lightboxGesture = "swipe";
          lightboxTouchStartX = event.clientX;
          lightboxTouchStartY = event.clientY;
        }
      );

      zoomImage.addEventListener(
        "pointermove",
        (event) => {
          if (overlay.hidden) return;

          if (
            lightboxGesture === "devtools-zoom" &&
            event.pointerId === devtoolsZoomPointerId
          ) {
            event.preventDefault();

            // Upward drag increases zoom; downward drag decreases it.
            const deltaY = devtoolsZoomStartY - event.clientY;
            zoomScale = Math.min(
              MAX_LIGHTBOX_ZOOM,
              Math.max(
                MIN_LIGHTBOX_ZOOM,
                devtoolsZoomStartScale * Math.pow(1.005, deltaY)
              )
            );

            if (zoomScale <= MIN_LIGHTBOX_ZOOM) {
              resetLightboxZoom();
              return;
            }

            clampLightboxPan();
            applyLightboxTransform();
            return;
          }

          if (!activePointers.has(event.pointerId)) return;

          activePointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });

          if (
            lightboxGesture === "pinch" &&
            activePointers.size >= 2
          ) {
            const distance = getPointerDistance();

            if (!pinchStartDistance) return;

            zoomScale = Math.min(
              MAX_LIGHTBOX_ZOOM,
              Math.max(
                MIN_LIGHTBOX_ZOOM,
                pinchStartScale * (distance / pinchStartDistance)
              )
            );

            if (zoomScale <= MIN_LIGHTBOX_ZOOM) {
              resetLightboxZoom();
              return;
            }

            clampLightboxPan();
            applyLightboxTransform();
            return;
          }

          if (
            lightboxGesture === "pan" &&
            activePointers.size === 1 &&
            zoomScale > MIN_LIGHTBOX_ZOOM
          ) {
            zoomX = panOriginX + (event.clientX - panStartX);
            zoomY = panOriginY + (event.clientY - panStartY);

            clampLightboxPan();
            applyLightboxTransform();
          }
        }
      );

      const finishPointer = (event) => {
        const wasDevtoolsZoom =
          lightboxGesture === "devtools-zoom" &&
          event.pointerId === devtoolsZoomPointerId;

        const wasSwipe =
          lightboxGesture === "swipe" &&
          activePointers.size === 1 &&
          activePointers.has(event.pointerId);

        if (wasDevtoolsZoom) {
          devtoolsZoomPointerId = null;
          lightboxGesture = null;

          try {
            zoomImage.releasePointerCapture?.(event.pointerId);
          } catch {
            // Pointer capture may already have been released.
          }

          return;
        }

        activePointers.delete(event.pointerId);

        if (wasSwipe && activePointers.size === 0) {
          const deltaX = event.clientX - lightboxTouchStartX;
          const deltaY = event.clientY - lightboxTouchStartY;

          if (
            Math.abs(deltaX) >= lightboxSwipeThreshold &&
            Math.abs(deltaX) > Math.abs(deltaY)
          ) {
            if (deltaX < 0) {
              updateLightbox(currentIndex + 1);
            } else {
              updateLightbox(currentIndex - 1);
            }
          }
        }

        if (activePointers.size === 1 && zoomScale > MIN_LIGHTBOX_ZOOM) {
          const remaining = Array.from(activePointers.values())[0];

          lightboxGesture = "pan";
          panStartX = remaining.x;
          panStartY = remaining.y;
          panOriginX = zoomX;
          panOriginY = zoomY;
        } else if (activePointers.size === 0) {
          lightboxGesture = null;
          pinchStartDistance = 0;

          if (zoomScale <= MIN_LIGHTBOX_ZOOM) {
            resetLightboxZoom();
          }
        }
      };

      zoomImage.addEventListener("pointerup", finishPointer);
      zoomImage.addEventListener("pointercancel", finishPointer);
      zoomImage.addEventListener("pointerleave", (event) => {
        // Pointer capture normally keeps the interaction on the image,
        // so this is only a cleanup path for browsers that release it.
        if (!zoomImage.hasPointerCapture?.(event.pointerId)) {
          finishPointer(event);
        }
      });

      // ------------------------------------------------------------
      // Desktop / Chrome DevTools pinch fallback.
      // Trackpad pinch gestures are reported as wheel events with
      // ctrlKey=true. Chrome DevTools' Shift-drag pinch can also be
      // represented through this path depending on the emulation mode.
      // ------------------------------------------------------------
      zoomImage.addEventListener(
        "wheel",
        (event) => {
          if (overlay.hidden) return;

          if (!event.ctrlKey && !event.shiftKey) return;

          event.preventDefault();
          event.stopPropagation();

          const factor = Math.pow(1.01, -event.deltaY);

          zoomBy(factor, event.clientX, event.clientY);
        },
        { passive: false }
      );

      const openLightbox = (index) => {
        updateLightbox(index);
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        overlay.focus();
      };

      const closeLightbox = () => {
        if (overlay.hidden) return;

        overlay.hidden = true;
        overlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = previousBodyOverflow;

        zoomImage.removeAttribute("src");
        zoomImage.alt = "";
        zoomCaption.innerHTML = "";
        zoomCaption.hidden = true;
      };

      items.forEach((item, index) => {
        const image = item.querySelector("[data-gallery-zoom-index]");
        if (!image) return;

        image.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          // A touch swipe may generate a click event immediately after
          // touchend. Suppress that click so a swipe does not open
          // the lightbox accidentally.
          if (Date.now() - lastCarouselSwipeAt < 500) {
            return;
          }

          openLightbox(index);
        });
      });

      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeLightbox();
      });

      prevButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateLightbox(currentIndex - 1);
      });

      nextButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateLightbox(currentIndex + 1);
      });

      overlay.addEventListener("click", (event) => {
        const clickedElement = event.target;

        if (
          clickedElement.closest(
            ".gallery-zoom-close, .gallery-zoom-prev, .gallery-zoom-next, .gallery-zoom-image, .gallery-zoom-caption"
          )
        ) {
          return;
        }

        closeLightbox();
      });

      document.addEventListener("keydown", (event) => {
        if (overlay.hidden) return;

        if (event.key === "Escape") {
          event.preventDefault();
          closeLightbox();
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          updateLightbox(currentIndex - 1);
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          updateLightbox(currentIndex + 1);
        }
      });
    };

    const initializeAllGalleries = () => {
      document
        .querySelectorAll("[data-gallery-carousel]")
        .forEach(initializeGallery);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeAllGalleries, {
        once: true,
      });
    } else {
      initializeAllGalleries();
    }
  })();
