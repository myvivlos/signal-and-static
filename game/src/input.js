export function createInputController(canvas, stageWidth, stageHeight, handlers) {
  const keys = {
    left: false,
    right: false,
    fine: false,
  };

  function toStageCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * stageWidth,
      y: ((clientY - rect.top) / rect.height) * stageHeight,
    };
  }

  function handleKeyDown(event) {
    handlers.onUserGesture?.();

    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      keys.left = true;
      event.preventDefault();
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      keys.right = true;
      event.preventDefault();
      return;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      keys.fine = true;
      return;
    }

    if (event.repeat) return;

    if (code === 'Space') {
      event.preventDefault();
      handlers.onLock?.();
    } else if (code === 'Enter') {
      event.preventDefault();
      handlers.onStart?.();
    } else if (code === 'KeyR') {
      handlers.onRestart?.();
    } else if (code === 'KeyM') {
      handlers.onToggleMute?.();
    }
  }

  function handleKeyUp(event) {
    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      keys.left = false;
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      keys.right = false;
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      keys.fine = false;
    }
  }

  function handleBlur() {
    keys.left = false;
    keys.right = false;
    keys.fine = false;
  }

  function handlePointerDown(event) {
    handlers.onUserGesture?.();
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }
    const pos = toStageCoords(event.clientX, event.clientY);
    handlers.onPointerDown?.(pos.x, pos.y);
  }

  function handlePointerMove(event) {
    const pos = toStageCoords(event.clientX, event.clientY);
    handlers.onPointerMove?.(pos.x, pos.y);
  }

  function handlePointerUp(event) {
    const pos = toStageCoords(event.clientX, event.clientY);
    handlers.onPointerUp?.(pos.x, pos.y);
  }

  function handleWheel(event) {
    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta !== 0) {
      handlers.onWheel?.(Math.sign(delta));
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  return {
    getKeyboardState() {
      return keys;
    },
    destroy() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('wheel', handleWheel);
    },
  };
}
