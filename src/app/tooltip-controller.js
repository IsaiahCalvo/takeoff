(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function computeTooltipPosition({ targetRect, placement, viewportHeight }) {
    if (placement === 'rail') {
      return {
        left: targetRect.right + 8,
        top: clamp(targetRect.top + targetRect.height / 2, 12, viewportHeight - 12),
        transform: 'translate(0, -50%)',
      };
    }
    return {
      left: targetRect.left + targetRect.width / 2,
      top: targetRect.bottom + 8,
      transform: 'translate(-50%, 0)',
    };
  }

  function createTooltipController({ tooltipEl, buttons, railEl = null, viewport = window }) {
    let target = null;

    function position(nextTarget = target) {
      if (!nextTarget) return;
      const pos = computeTooltipPosition({
        targetRect: nextTarget.getBoundingClientRect(),
        placement: railEl && railEl.contains(nextTarget) ? 'rail' : 'below',
        viewportHeight: viewport.innerHeight,
      });
      tooltipEl.style.transform = pos.transform;
      tooltipEl.style.left = `${pos.left}px`;
      tooltipEl.style.top = `${pos.top}px`;
    }

    function show(nextTarget) {
      if (!nextTarget?.dataset.tooltip) return;
      target = nextTarget;
      tooltipEl.textContent = nextTarget.dataset.tooltip;
      tooltipEl.classList.add('show');
      position(nextTarget);
    }

    function hide() {
      target = null;
      tooltipEl.classList.remove('show');
    }

    for (const button of buttons || []) {
      button.addEventListener('mouseenter', () => show(button));
      button.addEventListener('focus', () => show(button));
      button.addEventListener('mouseleave', hide);
      button.addEventListener('blur', hide);
    }

    viewport.addEventListener('resize', () => {
      if (tooltipEl.classList.contains('show')) position();
    });

    return { position, show, hide };
  }

  window.TakeoffTooltipController = {
    computeTooltipPosition,
    createTooltipController,
  };
})();
