import { useId, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

const mobileGraphQuery = '(max-width: 760px)';
export const isMobileGraph = () => window.matchMedia(mobileGraphQuery).matches;

function subscribeToGraphViewport(change: () => void) {
  const media = window.matchMedia(mobileGraphQuery);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

export function useMobileGraph() {
  return useSyncExternalStore(subscribeToGraphViewport, isMobileGraph, () => false);
}

export function GraphDetailSheet({ title, children, onClose, returnFocus }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const gripStart = useRef<number | null>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = sheet.current;
    if (!element) return;
    const origin = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      const target = origin instanceof HTMLElement && origin !== document.body && origin.isConnected && origin.getClientRects().length
        ? origin : returnFocus.current;
      target?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  return <dialog ref={sheet} className="graph-detail-sheet" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="graph-sheet-surface">
      <div className="graph-sheet-grip" aria-hidden="true" onPointerDown={(event) => {
        gripStart.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerUp={(event) => {
        if (gripStart.current !== null && event.clientY - gripStart.current > 48) onClose();
        gripStart.current = null;
      }} onPointerCancel={() => { gripStart.current = null; }} />
      <header className="graph-sheet-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Đóng chi tiết nút" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="graph-sheet-content">{children}</div>
    </div>
  </dialog>;
}
