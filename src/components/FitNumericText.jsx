import { useLayoutEffect, useRef } from 'react';

function childTextLength(children) {
  if (children == null || children === false) return 0;
  if (typeof children === 'string' || typeof children === 'number') return String(children).length;
  if (Array.isArray(children)) {
    return children.reduce((sum, child) => sum + childTextLength(child), 0);
  }
  return String(children).length;
}

/**
 * Shrinks numeric text so it stays inside its container as values grow longer.
 */
export default function FitNumericText({
  children,
  className = '',
  as: Tag = 'span',
  minScale = 0.62,
  ...rest
}) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const numCh = childTextLength(children);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;

    const fit = () => {
      inner.style.fontSize = '';
      const basePx = parseFloat(getComputedStyle(inner).fontSize) || 14;
      let size = basePx;
      const minPx = basePx * minScale;
      inner.style.fontSize = `${size}px`;

      let guard = 48;
      while (inner.scrollWidth > outer.clientWidth && size > minPx && guard > 0) {
        size = Math.max(minPx, size - 1);
        inner.style.fontSize = `${size}px`;
        guard -= 1;
      }
    };

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    const cell = outer.closest('td, th');
    if (cell) ro.observe(cell);

    return () => ro.disconnect();
  }, [children, minScale]);

  return (
    <Tag
      ref={outerRef}
      className={`fit-numeric${className ? ` ${className}` : ''}`}
      data-num-ch={numCh}
      style={{ '--num-ch': numCh }}
      {...rest}
    >
      <span ref={innerRef} className="fit-numeric__inner">
        {children}
      </span>
    </Tag>
  );
}
