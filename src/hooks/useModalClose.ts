import { useState, useCallback, useEffect, useRef } from "react";

export function useModalClose(open: boolean, onClose: () => void, duration = 100) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  const durationRef = useRef(duration);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (open) {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setVisible(true);
      setClosing(false);
      return;
    }

    if (!visible || closing) return;
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setClosing(false);
      setVisible(false);
      onCloseRef.current();
      closeTimeoutRef.current = null;
    }, durationRef.current);
  }, [closing, open, visible]);

  const handleClose = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setClosing(false);
      setVisible(false);
      onCloseRef.current();
      closeTimeoutRef.current = null;
    }, durationRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  return { visible, closing, handleClose };
}
